/**
 * The real Grid stack for the console's end-to-end tests, one service per call (Playwright's
 * `webServer` starts each): `api` on embedded PGlite in a fresh folder, and `runner` with the
 * stand-in Claude Code (`apps/runner/src/chaos/fake-claude.ts`) and stand-in opencode and Gemini
 * (`fake-acp.ts`) first on its PATH, so agents answer the same way every run. Everything lives in `.e2e-stack/`, made fresh each run, with the
 * fresh Grid's one-time setup link in `.e2e-stack/setup-link.txt`.
 *
 *   bun e2e/stack.ts api | runner
 */
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { PORTS } from "./ports";

const ROOT = join(import.meta.dir, "..", "..", "..");
const STACK = join(import.meta.dir, "..", ".e2e-stack");
const RUNNER_KEY = "e2e-runner-key-0123456789abcdef0123";

const service = process.argv[2];
if (service === "api") {
	rmSync(join(STACK, "api"), { recursive: true, force: true });
	mkdirSync(join(STACK, "api"), { recursive: true });
	// Migrated, then given the one-time setup link a fresh Grid has, as the launcher does it.
	const db = {
		cwd: join(ROOT, "packages", "db"),
		env: { ...process.env, GRID_DATA_DIR: join(STACK, "api"), DATABASE_URL: "" },
	};
	const migrated = Bun.spawnSync([process.execPath, "src/migrate.ts"], db);
	if (migrated.exitCode !== 0) throw new Error(`migrations failed: ${migrated.stderr.toString()}`);
	const made = Bun.spawnSync([process.execPath, "src/setup-code.ts"], db);
	const { code } = JSON.parse(made.stdout.toString().trim().split("\n").at(-1) ?? "{}") as {
		code?: string;
	};
	if (!code) throw new Error(`no setup code: ${made.stderr.toString()}`);
	writeFileSync(join(STACK, "setup-link.txt"), `/setup?code=${code}\n`);
	const child = Bun.spawn([process.execPath, "src/main.ts"], {
		cwd: join(ROOT, "apps", "api"),
		env: {
			...process.env,
			PORT: String(PORTS.api),
			GRID_DATA_DIR: join(STACK, "api"),
			DATABASE_URL: "",
			GRID_RUNNER_KEY: RUNNER_KEY,
			CONSOLE_URL: `http://localhost:${PORTS.console}`,
			PASSWORD_BCRYPT_ROUNDS: "10",
		},
		stdout: "inherit",
		stderr: "inherit",
	});
	process.exit(await child.exited);
} else if (service === "runner") {
	const dir = join(STACK, "runner");
	rmSync(dir, { recursive: true, force: true });
	const bin = join(dir, "bin");
	mkdirSync(bin, { recursive: true });
	mkdirSync(join(dir, "projects", "demo"), { recursive: true });
	const fake = join(ROOT, "apps", "runner", "src", "chaos", "fake-claude.ts");
	writeFileSync(join(bin, "claude"), `#!/bin/sh\nexec ${process.execPath} ${fake} "$@"\n`);
	chmodSync(join(bin, "claude"), 0o755);
	// Stand-ins for agents that speak ACP, so the console is tried against more than Claude Code.
	const acp = join(ROOT, "apps", "runner", "src", "chaos", "fake-acp.ts");
	for (const agent of ["opencode", "gemini"]) {
		writeFileSync(
			join(bin, agent),
			`#!/bin/sh\nFAKE_ACP_AS=${agent} exec ${process.execPath} ${acp} "$@"\n`,
		);
		chmodSync(join(bin, agent), 0o755);
	}
	const child = Bun.spawn([process.execPath, "src/main.ts"], {
		cwd: join(ROOT, "apps", "runner"),
		env: {
			...process.env,
			PATH: `${bin}:${process.env.PATH ?? ""}`,
			RUNNER_PORT: String(PORTS.runner),
			RUNNER_CHAT_DB: join(dir, "chat.db"),
			RUNNER_PROJECTS_DIR: join(dir, "projects"),
			GRID_API_URL: `http://localhost:${PORTS.api}`,
			GRID_RUNNER_KEY: RUNNER_KEY,
			XDG_DATA_HOME: join(dir, "data"),
			RUNNER_ACP_AGENTS: JSON.stringify([
				{ id: "gemini", name: "Gemini", command: ["gemini", "--experimental-acp"] },
			]),
		},
		stdout: "inherit",
		stderr: "inherit",
	});
	process.exit(await child.exited);
} else {
	console.error("bun e2e/stack.ts api | runner");
	process.exit(1);
}
