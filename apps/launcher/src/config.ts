import { join } from "node:path";

type Env = Record<string, string | undefined>;

export type LaunchConfig = {
	/** The one public port: the console, with /api and /runner forwarded behind it. */
	port: number;
	apiPort: number;
	runnerPort: number;
	/** Secrets, the first-run setup link and the chat database. */
	dataDir: string;
	/** Where new project folders go and where the runner's terminals start. */
	projectsDir: string;
	databaseUrl: string | undefined;
	rebuild: boolean;
	/**
	 * Let a home Grid pair with this one and drive it as an environment. On by default when the
	 * machine was put on a tailnet with an auth key (a Codespace with a TS_AUTH_KEY secret), since
	 * that is what the key is for; GRID_PAIRING=0 or 1 decides otherwise.
	 */
	pairing: boolean;
};

export function readLaunchConfig(env: Env, root: string): LaunchConfig {
	const dataDir = env.GRID_DATA_DIR ?? join(root, ".grid");
	return {
		port: Number(env.GRID_PORT ?? 8080),
		apiPort: Number(env.GRID_API_PORT ?? 4000),
		runnerPort: Number(env.GRID_RUNNER_PORT ?? 4100),
		dataDir,
		// In a Codespace the repos live under /workspaces, so that is where projects belong.
		projectsDir:
			env.GRID_PROJECTS_DIR ?? (env.CODESPACES ? "/workspaces" : join(dataDir, "projects")),
		databaseUrl: env.DATABASE_URL || undefined,
		rebuild: env.GRID_REBUILD === "1",
		pairing: env.GRID_PAIRING ? env.GRID_PAIRING === "1" : Boolean(env.TS_AUTH_KEY),
	};
}

/** The address people open: the Codespace's forwarded URL, GRID_PUBLIC_URL, or localhost. */
export function gatewayUrl(config: LaunchConfig, env: Env): string {
	if (env.GRID_PUBLIC_URL) return env.GRID_PUBLIC_URL;
	if (env.CODESPACE_NAME && env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN) {
		return `https://${env.CODESPACE_NAME}-${config.port}.${env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`;
	}
	return `http://localhost:${config.port}`;
}
