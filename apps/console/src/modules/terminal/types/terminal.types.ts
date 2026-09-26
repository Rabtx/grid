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
	provider?: string;
	/** The environment it runs on (Settings → Environments); absent for this machine. */
	environment?: string;
};
