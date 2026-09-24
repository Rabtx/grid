import { homedir } from "node:os";

import { readTranscribeConfig, type TranscribeConfig } from "./transcribe";

/** Everything the runner reads from its environment, resolved once at start-up. */
export type RunnerConfig = {
	/** Loopback by default: the console reaches the runner through its own proxy, never directly. */
	host: string;
	port: number;
	/** The API that owns sign-in; each connection's token is checked against it. */
	apiUrl: string;
	/** The shell a new terminal starts, as a login shell. */
	shell: string;
	/** Where a new terminal starts when the console does not ask for a directory. */
	defaultCwd: string;
	/** Output kept per terminal and replayed to a client that (re)attaches. */
	replayBytes: number;
	/** Upper bound on terminals one person can hold open at once. */
	maxTerminalsPerUser: number;
	/** Speech-to-text for voice input, when the browser has no recogniser of its own. */
	transcribe: TranscribeConfig;
};

export function readConfig(env: Record<string, string | undefined> = process.env): RunnerConfig {
	return {
		host: env.RUNNER_HOST ?? "127.0.0.1",
		port: Number(env.RUNNER_PORT ?? 4100),
		apiUrl: (env.GRID_API_URL ?? "http://localhost:4000").replace(/\/$/, ""),
		shell: env.RUNNER_SHELL ?? env.SHELL ?? "/bin/bash",
		defaultCwd: env.RUNNER_CWD ?? homedir(),
		replayBytes: Number(env.RUNNER_REPLAY_BYTES ?? 512 * 1024),
		maxTerminalsPerUser: Number(env.RUNNER_MAX_TERMINALS ?? 16),
		transcribe: readTranscribeConfig(env),
	};
}
