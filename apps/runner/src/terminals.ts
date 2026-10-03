import { statSync } from "node:fs";
import { basename } from "node:path";

import type { RunnerConfig } from "./config";
import { insideProjectsDir } from "./folders/folders";
import { readMachine, terminalStatus, type TerminalStatus } from "./terminal-status";

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
	/** When the shell ended, for the panel's Recent ("exit 0 · 1d ago"). */
	endedAt: string | null;
};

/** One attached client. A terminal can have several (a phone and a laptop on the same shell). */
export type TerminalClient = {
	output: (bytes: Uint8Array) => void;
	exited: (code: number) => void;
	titled: (title: string) => void;
};

/** A handle on the PTY, so tests can stand in for a real shell. */
export type Pty = {
	/** The shell's process id, to read what it is doing; absent where the platform hides it. */
	pid?: number;
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
	/** Every byte the shell has printed, counted: a client says how far it got, to catch up. */
	private written = 0;
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
		this.written += bytes.byteLength;
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

	/**
	 * What a client that already has everything up to `offset` is missing: just the bytes after
	 * it, when they are still kept; otherwise null, and the client starts over from what is kept.
	 */
	since(offset: number): { at: number; bytes: Uint8Array[] } | null {
		const start = this.written - this.replaySize;
		if (!Number.isInteger(offset) || offset < start || offset > this.written) return null;
		let skip = offset - start;
		const bytes: Uint8Array[] = [];
		for (const chunk of this.replay) {
			if (skip >= chunk.byteLength) {
				skip -= chunk.byteLength;
				continue;
			}
			bytes.push(skip > 0 ? chunk.subarray(skip) : chunk);
			skip = 0;
		}
		return { at: offset, bytes };
	}

	/** Everything kept, and the byte offset it starts at. */
	kept(): { at: number; bytes: Uint8Array[] } {
		return { at: this.written - this.replaySize, bytes: [...this.replay] };
	}
}

/** Every terminal the runner holds, keyed by id and scoped to the person who opened it. */
export class TerminalStore {
	private readonly terminals = new Map<string, Terminal>();

	constructor(
		private readonly config: RunnerConfig,
		private readonly spawnPty: SpawnPty,
	) {}

	/** How many terminals are open on this machine, everyone's. */
	count(): number {
		return this.terminals.size;
	}

	list(ownerId: string): TerminalInfo[] {
		return [...this.terminals.values()]
			.filter((terminal) => terminal.ownerId === ownerId)
			.map((terminal) => terminal.info)
			.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
	}

	/**
	 * Each of a person's terminals with what it is doing now: where its shell is, what runs in it,
	 * the ports it serves, the branch, and its last lines. Ended ones keep only their last lines.
	 */
	async statuses(ownerId: string): Promise<(TerminalInfo & { status: TerminalStatus })[]> {
		const mine = [...this.terminals.values()]
			.filter((terminal) => terminal.ownerId === ownerId)
			.sort((a, b) => a.info.createdAt.localeCompare(b.info.createdAt));
		if (mine.length === 0) return [];
		const machine = await readMachine();
		return Promise.all(
			mine.map(async (terminal) => ({
				...terminal.info,
				status: await terminalStatus(terminal.pty?.pid ?? null, terminal.history(), machine),
			})),
		);
	}

	/**
	 * Open a new shell, optionally typing a first command into it (an agent's installer or
	 * sign-in, say). Returns null once the person already holds the maximum.
	 */
	open(
		ownerId: string,
		size: { cols: number; rows: number },
		cwd?: string,
		run?: { command: string; title: string },
	): TerminalInfo | null {
		if (this.list(ownerId).length >= this.config.maxTerminalsPerUser) return null;
		const start =
			(cwd?.trim() ? safeDirectory(cwd, this.config.projectsDir) : null) ??
			safeDirectory(this.config.defaultCwd, this.config.projectsDir) ??
			safeDirectory(this.config.projectsDir, this.config.projectsDir) ??
			this.config.projectsDir;
		const cols = clampSize(size.cols, 80);
		const rows = clampSize(size.rows, 24);
		const terminal = new Terminal(
			ownerId,
			{
				id: crypto.randomUUID(),
				title: run?.title ?? basename(this.config.shell),
				cwd: start,
				cols,
				rows,
				createdAt: new Date().toISOString(),
				exitCode: null,
				endedAt: null,
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
				terminal.info = { ...terminal.info, exitCode: code, endedAt: new Date().toISOString() };
				terminal.pty = null;
				for (const client of terminal.clients) client.exited(code);
			},
		});
		// The shell reads it once it is up, like anything typed ahead.
		if (run) terminal.pty?.write(`${run.command}\r`);
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
		offset?: number,
	): {
		info: TerminalInfo;
		history: Uint8Array[];
		/** True when `history` only continues from `offset` (the client keeps its screen). */
		resumed: boolean;
		/** The byte offset `history` starts at. */
		at: number;
		detach: () => void;
	} | null {
		const terminal = this.owned(ownerId, id);
		if (!terminal) return null;
		terminal.clients.add(client);
		const tail = offset === undefined ? null : terminal.since(offset);
		const replay = tail ?? terminal.kept();
		return {
			info: terminal.info,
			history: replay.bytes,
			resumed: tail !== null,
			at: replay.at,
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

function safeDirectory(path: string, projectsDir: string): string | null {
	try {
		const bounded = insideProjectsDir(path, projectsDir);
		return isDirectory(bounded) ? bounded : null;
	} catch {
		return null;
	}
}

/** A PTY size the kernel accepts: whole cells, at least 2 and at most 1000. */
function clampSize(value: number, fallback: number): number {
	if (!Number.isFinite(value)) return fallback;
	return Math.min(1000, Math.max(2, Math.floor(value)));
}
