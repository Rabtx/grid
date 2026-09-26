/**
 * `bun run grid` — the whole of Grid from one command, on one port.
 *
 * Grid is one disposable bundle: the same checkout runs on a laptop, a VPS or a Codespace. This
 * launcher prepares what a fresh machine lacks — a data directory, generated secrets, a Postgres
 * (Docker, when DATABASE_URL isn't set), migrations and an owner account — then runs the API, the
 * runner and the console behind a single gateway port and stops them together.
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { gatewayUrl, readLaunchConfig, type LaunchConfig } from "./config";
import { waitForTailnet } from "./tailnet";

const root = resolve(import.meta.dir, "../../..");
const app = (name: string): string => join(root, "apps", name);
const pkg = (name: string): string => join(root, "packages", name);

type Secrets = { jwtSecret: string; authTokenSecret: string };

/** Secrets are generated once per data directory, so sessions survive restarts. */
function loadSecrets(dataDir: string): Secrets {
	const file = join(dataDir, "secrets.json");
	if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as Secrets;
	const secrets: Secrets = {
		jwtSecret: randomBytes(32).toString("hex"),
		authTokenSecret: randomBytes(32).toString("hex"),
	};
	writeFileSync(file, JSON.stringify(secrets), { mode: 0o600 });
	return secrets;
}

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

/** Without DATABASE_URL, start the repo's Postgres container and use it. */
async function databaseUrl(config: LaunchConfig): Promise<string> {
	if (config.databaseUrl) return config.databaseUrl;
	if (!Bun.which("docker")) {
		throw new Error(
			"Set DATABASE_URL to a Postgres database, or install Docker so Grid can start one.",
		);
	}
	log("DATABASE_URL is not set — starting Postgres with Docker");
	await run(
		["docker", "compose", "-f", "docker/compose/postgres.yml", "up", "-d", "postgres"],
		root,
		{},
	);
	return "postgresql://grid:grid@localhost:5433/grid";
}

/** Migrate, retrying while a just-started Postgres finishes booting. */
async function migrate(env: Record<string, string>): Promise<void> {
	for (let attempt = 1; ; attempt++) {
		try {
			await run(["bun", "src/migrate.ts"], pkg("db"), env);
			return;
		} catch (error) {
			if (attempt >= 30) throw error;
			if (attempt === 1) log("waiting for Postgres…");
			await Bun.sleep(1000);
		}
	}
}

type Owner = { created: false } | { created: true; email: string; password: string };

async function ensureOwner(config: LaunchConfig, env: Record<string, string>): Promise<void> {
	const output = await run(["bun", "src/owner.ts"], pkg("db"), {
		...env,
		GRID_OWNER_EMAIL: config.ownerEmail,
	});
	const owner = JSON.parse(output.trim().split("\n").at(-1) ?? "{}") as Owner;
	const file = join(config.dataDir, "owner.txt");
	if (owner.created) {
		writeFileSync(file, `email: ${owner.email}\npassword: ${owner.password}\n`, { mode: 0o600 });
		log(`created the owner account — sign in as ${owner.email}; the password is in ${file}`);
	} else if (existsSync(file)) {
		log(`the owner's first sign-in details are in ${file}`);
	}
}

async function buildConsole(config: LaunchConfig): Promise<void> {
	if (!config.rebuild && existsSync(join(app("console"), "dist", "index.html"))) return;
	log("building the console…");
	await run(["bun", "run", "build"], app("console"), {});
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
	const database = { DATABASE_URL: await databaseUrl(config) };
	await migrate(database);
	await ensureOwner(config, database);
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

	const apiEnv = {
		...database,
		NODE_ENV: "development",
		JWT_SECRET: secrets.jwtSecret,
		AUTH_TOKEN_SECRET: secrets.authTokenSecret,
		AUTH_DEV_EXPOSE_CODES: "false",
	};
	const services: { name: string; cmd: string[]; cwd: string; env: Record<string, string> }[] = [
		// The API: Hono on the API port, handing the routes it does not serve yet to NestJS on
		// loopback behind it. Both read the same database and secrets.
		{
			name: "api",
			cmd: ["bun", "src/main.ts"],
			cwd: app("api"),
			env: {
				...apiEnv,
				PORT: String(config.apiPort),
				GRID_LEGACY_API_URL: `http://127.0.0.1:${config.legacyApiPort}`,
			},
		},
		{
			name: "legacy-api",
			cmd: ["bun", "src/main.ts"],
			cwd: app("nest-api"),
			env: { ...apiEnv, PORT: String(config.legacyApiPort) },
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
