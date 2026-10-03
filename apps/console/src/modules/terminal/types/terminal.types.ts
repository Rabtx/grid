/** What a terminal is doing (apps/runner/src/terminal-status.ts). */
export type TerminalStatus = {
	/** The shell's folder now. */
	cwd: string | null;
	/** The command in the foreground; null at the prompt. */
	command: string | null;
	ports: number[];
	branch: string | null;
	ahead: number | null;
	/** Its last lines. */
	preview: string[];
};

/** A terminal as the runner reports it (apps/runner/src/terminals.ts). */
export type TerminalInfo = {
	id: string;
	title: string;
	cwd: string;
	cols: number;
	rows: number;
	createdAt: string;
	/** Null while the shell runs; its exit code once it has ended. */
	exitCode: number | null;
	/** When it ended; older runners leave it out. */
	endedAt?: string | null;
	/** What it is doing, when the list was asked for it (`status`). */
	status?: TerminalStatus;
	/** The environment it runs on (Settings → Environments); absent for this machine. */
	environment?: string;
};
