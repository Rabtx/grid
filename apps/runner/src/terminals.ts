import { statSync } from "node:fs";
import { basename } from "node:path";

import type { RunnerConfig } from "./config";

/** What the console sees of a terminal: enough to draw its tab. */
export type TerminalInfo = {
	id: string;
	title: string;
	cwd: string;
	cols: number;
	rows: number;
	createdAt: string;
	/** Null while the shell runs; its exit code once it has ended. */
	exitCode: number | null;
};

/** One attached client. A terminal can have several (a phone and a laptop on the same shell). */
export type TerminalClient = {
	output: (bytes: Uint8Array) => void;
	exited: (code: number) => void;
	titled: (title: string) => void;
};

/** A handle on the PTY, so tests can stand in for a real shell. */
export type Pty = {
	write: (data: string | Uint8Array) => void;
	resize: (cols: number, rows: number) => void;
	kill: () => void;
};

export type SpawnPty = (options: {
	shell: string;
	cwd: string;
	cols: number;
	rows: number;
	onData: (bytes: Uint8Array) => void;
	onExit: (code: number) => void;
}) => Pty;

// OSC 0 / OSC 2 set the window title; shells and TUIs use them to say what is running.
// oxlint-disable-next-line no-control-regex -- escape sequences are made of control characters
const TITLE_SEQUENCE = /\x1b\][02];([^\x07\x1b]*)(?:\x07|\x1b\\)/g;

class Terminal {
	readonly clients = new Set<TerminalClient>();
	private readonly replay: Uint8Array[] = [];
	private replaySize = 0;
	info: TerminalInfo;
	pty: Pty | null = null;

	constructor(
		readonly ownerId: string,
		info: TerminalInfo,
		private readonly replayLimit: number,
	) {
		this.info = info;
	}

	record(bytes: Uint8Array): void {
		this.replay.push(bytes);
		this.replaySize += bytes.byteLength;
		while (this.replaySize > this.replayLimit && this.replay.length > 1) {
			this.replaySize -= this.replay.shift()?.byteLength ?? 0;
		}
		for (const client of this.clients) client.output(bytes);

		let title: string | null = null;
		for (const match of new TextDecoder().decode(bytes).matchAll(TITLE_SEQUENCE)) title = match[1];
		if (title !== null && title !== this.info.title) {
			this.info = { ...this.info, title };
			for (const client of this.clients) client.titled(title);
		}
	}

	history(): Uint8Array[] {
		return [...this.replay];
	}
}

/** Every terminal the runner holds, keyed by id and scoped to the person who opened it. */
export class TerminalStore {
	private readonly terminals = new Map<string, Terminal>();

	constructor(
		private readonly config: RunnerConfig,
		private readonly spawnPty: SpawnPty,
	) {}

	list(ownerId: string): TerminalInfo[] {
		return [...this.terminals.values()]
			.filter((terminal) => terminal.ownerId === ownerId)
			.map((terminal) => terminal.info)
			.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
	}

	/** Open a new shell. Returns null once the person already holds the maximum. */
	open(ownerId: string, size: { cols: number; rows: number }, cwd?: string): TerminalInfo | null {
		if (this.list(ownerId).length >= this.config.maxTerminalsPerUser) return null;
		const start = cwd && isDirectory(cwd) ? cwd : this.config.defaultCwd;
		const cols = clampSize(size.cols, 80);
		const rows = clampSize(size.rows, 24);
		const terminal = new Terminal(
			ownerId,
			{
				id: crypto.randomUUID(),
				title: basename(this.config.shell),
				cwd: start,
				cols,
				rows,
				createdAt: new Date().toISOString(),
				exitCode: null,
			},
			this.config.replayBytes,
		);
		this.terminals.set(terminal.info.id, terminal);
		terminal.pty = this.spawnPty({
			shell: this.config.shell,
			cwd: start,
			cols,
			rows,
			onData: (bytes) => terminal.record(bytes),
			onExit: (code) => {
				terminal.info = { ...terminal.info, exitCode: code };
				terminal.pty = null;
				for (const client of terminal.clients) client.exited(code);
			},
		});
		return terminal.info;
	}

	/**
	 * Attach a client: it gets the recent output first, then everything live. Returns a detach
	 * function, or null when the terminal does not exist or belongs to someone else.
	 */
	attach(
		ownerId: string,
		id: string,
		client: TerminalClient,
	): { info: TerminalInfo; history: Uint8Array[]; detach: () => void } | null {
		const terminal = this.owned(ownerId, id);
		if (!terminal) return null;
		terminal.clients.add(client);
		return {
			info: terminal.info,
			history: terminal.history(),
			detach: () => terminal.clients.delete(client),
		};
	}

	write(ownerId: string, id: string, data: string | Uint8Array): void {
		this.owned(ownerId, id)?.pty?.write(data);
	}

	resize(ownerId: string, id: string, cols: number, rows: number): void {
		const terminal = this.owned(ownerId, id);
		if (!terminal?.pty) return;
		const next = {
			cols: clampSize(cols, terminal.info.cols),
			rows: clampSize(rows, terminal.info.rows),
		};
		if (next.cols === terminal.info.cols && next.rows === terminal.info.rows) return;
		terminal.info = { ...terminal.info, ...next };
		terminal.pty.resize(next.cols, next.rows);
	}

	/** End the shell (if it still runs) and forget the terminal. */
	close(ownerId: string, id: string): boolean {
		const terminal = this.owned(ownerId, id);
		if (!terminal) return false;
		terminal.pty?.kill();
		this.terminals.delete(id);
		return true;
	}

	closeAll(): void {
		for (const terminal of this.terminals.values()) terminal.pty?.kill();
		this.terminals.clear();
	}

	private owned(ownerId: string, id: string): Terminal | null {
		const terminal = this.terminals.get(id);
		return terminal && terminal.ownerId === ownerId ? terminal : null;
	}
}

function isDirectory(path: string): boolean {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

/** A PTY size the kernel accepts: whole cells, at least 2 and at most 1000. */
function clampSize(value: number, fallback: number): number {
	if (!Number.isFinite(value)) return fallback;
	return Math.min(1000, Math.max(2, Math.floor(value)));
}
