/**
 * `bun run grid` — the whole of Grid from one command, on one port.
 *
 * Grid is one disposable bundle: the same checkout runs on a laptop, a VPS or a Codespace. This
 * launcher prepares what a fresh machine lacks — a data directory, generated secrets, a Postgres
 * (Docker, when DATABASE_URL isn't set), migrations and a first-run setup link — then runs the API, the
 * runner and the console behind a single gateway port and stops them together.
 */
import {
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

import { gatewayUrl, readLaunchConfig, type LaunchConfig } from "./config";
import { loadSecrets } from "./secrets";
import { waitForTailnet } from "./tailnet";

const root = resolve(import.meta.dir, "../../..");
const app = (name: string): string => join(root, "apps", name);
const pkg = (name: string): string => join(root, "packages", name);

function log(message: string): void {
	console.log(`[grid] ${message}`);
}

async function run(cmd: string[], cwd: string, env: Record<string, string>): Promise<string> {
	const child = Bun.spawn(cmd, {
		cwd,
		env: { ...process.env, ...env },
		stdout: "pipe",
		stderr: "inherit",
	});
	const output = await new Response(child.stdout).text();
	const code = await child.exited;
	if (code !== 0) throw new Error(`${cmd.join(" ")} exited with ${code}`);
	return output;
}

/** Without DATABASE_URL, Grid runs on embedded PGlite under the data directory. */
function databaseEnv(config: LaunchConfig): Record<string, string> {
	if (config.databaseUrl) {
		return { DATABASE_URL: config.databaseUrl };
	}
	log(`DATABASE_URL is not set — using embedded PGlite under ${config.dataDir}`);
	return { GRID_DATA_DIR: config.dataDir };
}

/** Migrate, retrying while a just-started Postgres finishes booting. */
async function migrate(env: Record<string, string>): Promise<void> {
	const isPostgres = Boolean(env.DATABASE_URL);
	for (let attempt = 1; ; attempt++) {
		try {
			await run(["bun", "src/migrate.ts"], pkg("db"), env);
			return;
		} catch (error) {
			if (!isPostgres || attempt >= 30) throw error;
			if (attempt === 1) log("waiting for Postgres…");
			await Bun.sleep(1000);
		}
	}
}

/**
 * A Grid nobody has signed up to yet gets a one-time setup link: whoever opens it creates the
 * owner account and the first workspace. A new link every start until then (only its hash is
 * stored); kept in setup-link.txt too, for a Grid started in the background.
 */
async function ensureSetupLink(config: LaunchConfig, env: Record<string, string>): Promise<void> {
	const output = await run(["bun", "src/setup-code.ts"], pkg("db"), env);
	const { code } = JSON.parse(output.trim().split("\n").at(-1) ?? "{}") as { code?: string | null };
	const file = join(config.dataDir, "setup-link.txt");
	if (!code) {
		rmSync(file, { force: true });
		return;
	}
	const link = `${gatewayUrl(config, process.env)}/setup?code=${code}`;
	writeFileSync(file, `${link}\n`, { mode: 0o600 });
	log(`set up this Grid: open ${link}`);
}

async function buildConsole(config: LaunchConfig): Promise<void> {
	if (!config.rebuild && existsSync(join(app("console"), "dist", "index.html"))) return;
	log("building the console…");
	await run(["bun", "run", "build"], app("console"), {});
}

/**
 * Uploaded files (avatars) live in the data directory, next to Grid's other state. Files the
 * old API kept in apps/nest-api/uploads are moved over once, so their URLs keep working.
 */
function prepareUploads(dataDir: string): string {
	const uploads = join(dataDir, "uploads");
	const old = join(root, "apps", "nest-api", "uploads");
	if (existsSync(old) && !existsSync(uploads)) {
		mkdirSync(dataDir, { recursive: true });
		try {
			renameSync(old, uploads);
		} catch (error) {
			// Another disk (a Docker volume, a separate data drive): copy, then remove the old copy.
			if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
			cpSync(old, uploads, { recursive: true });
			rmSync(old, { recursive: true, force: true });
		}
		log(`moved uploaded files to ${uploads}`);
	}
	mkdirSync(join(uploads, "avatars"), { recursive: true });
	return uploads;
}

/** One Grid per data directory: a second start (another shell, a re-attached Codespace) exits. */
function claimDataDir(dataDir: string): boolean {
	const file = join(dataDir, "grid.pid");
	if (existsSync(file)) {
		const pid = Number(readFileSync(file, "utf8"));
		if (isLauncher(pid)) return false;
		// A stale file from a Grid that didn't shut down cleanly (or from before a restart, when
		// its number may now belong to something else).
	}
	writeFileSync(file, String(process.pid));
	process.on("exit", () => rmSync(file, { force: true }));
	return true;
}

/** Whether a process is alive and is a Grid launcher (on Linux, by its command line). */
function isLauncher(pid: number): boolean {
	try {
		process.kill(pid, 0);
	} catch {
		return false;
	}
	try {
		return readFileSync(`/proc/${pid}/cmdline`, "utf8").includes("src/main.ts");
	} catch {
		// No /proc (macOS): a live process with that number is the best we can tell.
		return true;
	}
}

function main(): Promise<void> {
	const config = readLaunchConfig(process.env, root);
	mkdirSync(config.dataDir, { recursive: true });
	mkdirSync(config.projectsDir, { recursive: true });
	if (!claimDataDir(config.dataDir)) {
		log(`already running at ${gatewayUrl(config, process.env)}`);
		return Promise.resolve();
	}
	return start(config);
}

async function start(config: LaunchConfig): Promise<void> {
	const secrets = loadSecrets(config.dataDir);
	const database = databaseEnv(config);
	await migrate(database);
	await ensureSetupLink(config, database);
	await buildConsole(config);

	// Paired, the runner listens on this machine's tailnet address only: the home Grid reaches
	// it over WireGuard, and nothing else can. Without a tailnet it stays on loopback.
	let runnerHost = "127.0.0.1";
	if (config.pairing) {
		const self = await waitForTailnet();
		if (self) {
			runnerHost = self.ip;
			log(`pairing on: add http://${self.dnsName}:${config.runnerPort} to your home Grid`);
			log("get a pairing code with: bun run grid:pair");
		} else {
			log("pairing is on but this machine is not on a tailnet; the runner stays on loopback");
		}
	}

	const uploadsDir = prepareUploads(config.dataDir);
	const services: { name: string; cmd: string[]; cwd: string; env: Record<string, string> }[] = [
		{
			name: "api",
			cmd: ["bun", "src/main.ts"],
			cwd: app("api"),
			env: {
				...database,
				NODE_ENV: "development",
				PORT: String(config.apiPort),
				JWT_SECRET: secrets.jwtSecret,
				AUTH_TOKEN_SECRET: secrets.authTokenSecret,
				GRID_RUNNER_KEY: secrets.runnerKey,
				AUTH_DEV_EXPOSE_CODES: "false",
				GRID_UPLOADS_DIR: uploadsDir,
				GRID_DATA_DIR: config.dataDir,
			},
		},
		{
			name: "runner",
			cmd: ["bun", "src/main.ts"],
			cwd: app("runner"),
			env: {
				RUNNER_PORT: String(config.runnerPort),
				RUNNER_HOST: runnerHost,
				RUNNER_PAIRING: runnerHost === "127.0.0.1" ? "0" : "1",
				GRID_API_URL: `http://127.0.0.1:${config.apiPort}`,
				GRID_RUNNER_KEY: secrets.runnerKey,
				RUNNER_CHAT_DB: join(config.dataDir, "chat.db"),
				RUNNER_PROJECTS_DIR: config.projectsDir,
				RUNNER_CWD: config.projectsDir,
			},
		},
		{
			name: "gateway",
			cmd: [
				"bun",
				"x",
				"vite",
				"preview",
				"--host",
				"0.0.0.0",
				"--port",
				String(config.port),
				"--strictPort",
			],
			cwd: app("console"),
			env: {
				GRID_API_PROXY: `http://127.0.0.1:${config.apiPort}`,
				GRID_RUNNER_PROXY: `http://${runnerHost}:${config.runnerPort}`,
			},
		},
	];

	const children = services.map((service) =>
		Bun.spawn(service.cmd, {
			cwd: service.cwd,
			env: { ...process.env, ...service.env },
			stdout: "inherit",
			stderr: "inherit",
		}),
	);
	const stop = (code: number): void => {
		for (const child of children) child.kill();
		process.exit(code);
	};
	process.on("SIGINT", () => stop(0));
	process.on("SIGTERM", () => stop(0));
	log(`Grid is starting at ${gatewayUrl(config, process.env)}`);

	const [index, code] = await Promise.race(
		children.map((child, index) => child.exited.then((code) => [index, code] as const)),
	);
	log(`${services[index]?.name} exited with ${code} — stopping Grid`);
	stop(code === 0 ? 1 : code);
}

main().catch((error: unknown) => {
	console.error(`[grid] ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
});
