import { existsSync } from "node:fs";

import { Terminal } from "@xterm/headless";

/**
 * An agent that only has an interactive terminal UI, run in a pseudo-terminal and read the way a
 * person reads it: through a headless terminal that keeps the rendered screen. Callers drive it
 * with keys and parse `lines()`, never the raw bytes, so cursor moves and redraws are already
 * applied.
 */
export type TuiProcess = {
	/** The visible screen, one string per row, right-trimmed; after exit, the last one shown. */
	lines: () => string[];
	write: (keys: string) => void;
	/** Called soon after the screen changes (at most every READ_MS); pass undefined to stop. */
	onChange: (listener?: () => void) => void;
	/** Resolves with the screen once `ready` holds; rejects on timeout or exit. */
	wait: (ready: (lines: string[]) => boolean, timeoutMs?: number) => Promise<string[]>;
	exited: Promise<number>;
	readonly alive: boolean;
	/** Ends the process with a signal (SIGTERM by default). */
	kill: () => void;
};

export type TuiOptions = {
	command: string[];
	cwd: string;
	cols: number;
	rows: number;
	/** Name used in errors ("Freebuff did not respond in time"). */
	name: string;
	env?: Record<string, string | undefined>;
};

/**
 * Read the screen at most this often while it changes. Not "once it settles": a UI with a ticking
 * timer never settles, and a reply scrolling past would be missed between reads.
 */
const READ_MS = 40;

export function spawnTui(options: TuiOptions): TuiProcess {
	// Spawning in a missing folder fails as if the program were missing; say what is really wrong.
	if (!existsSync(options.cwd)) throw new Error(`The folder ${options.cwd} does not exist`);
	const vt = new Terminal({ cols: options.cols, rows: options.rows, allowProposedApi: true });
	const decoder = new TextDecoder();
	let alive = true;
	let listener: (() => void) | undefined;
	let settle: ReturnType<typeof setTimeout> | undefined;
	const waiters = new Set<() => void>();

	const changed = () => {
		settle ??= setTimeout(() => {
			settle = undefined;
			listener?.();
			for (const check of waiters) check();
		}, READ_MS);
	};

	const proc = Bun.spawn(options.command, {
		cwd: options.cwd,
		env: { ...process.env, ...options.env, TERM: "xterm-256color", COLORTERM: "truecolor" },
		terminal: {
			cols: options.cols,
			rows: options.rows,
			data: (_terminal, bytes) => vt.write(decoder.decode(bytes, { stream: true }), changed),
		},
	});
	const terminal = proc.terminal;
	if (!terminal) throw new Error(`Bun did not attach a terminal to ${options.name}`);

	const read = (): string[] => {
		const buffer = vt.buffer.active;
		return Array.from({ length: options.rows }, (_, row) =>
			(buffer.getLine(buffer.viewportY + row)?.translateToString(true) ?? "").trimEnd(),
		);
	};
	// What it showed as it ended (a crash report, a sign-in prompt), kept for the error.
	let last: string[] = [];

	const exited = proc.exited.then((code) => {
		last = read();
		alive = false;
		clearTimeout(settle);
		for (const check of waiters) check();
		terminal.close();
		vt.dispose();
		return code;
	});

	const lines = (): string[] => (alive ? read() : last);

	return {
		lines,
		write: (keys) => {
			if (alive) terminal.write(keys);
		},
		onChange: (next) => {
			listener = next;
		},
		wait: (ready, timeoutMs = 15_000) =>
			new Promise((resolve, reject) => {
				const done = () => {
					waiters.delete(check);
					clearTimeout(timer);
				};
				const check = () => {
					if (!alive) {
						done();
						reject(new Error(`${options.name} exited`));
						return;
					}
					const screen = lines();
					if (ready(screen)) {
						done();
						resolve(screen);
					}
				};
				const timer = setTimeout(() => {
					done();
					reject(new Error(`${options.name} did not respond in time`));
				}, timeoutMs);
				waiters.add(check);
				check();
			}),
		exited,
		get alive() {
			return alive;
		},
		kill: () => proc.kill(),
	};
}
