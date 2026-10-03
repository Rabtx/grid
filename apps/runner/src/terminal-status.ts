import { readdir, readFile, readlink } from "node:fs/promises";

/**
 * What a terminal is doing, for the Terminals panel (Figma 15 · Terminals): where its shell is now,
 * the command in the foreground, the ports that command serves, the git branch there and how far
 * ahead of its upstream, and its last few lines. Read from `/proc`, `ss` and `git` on Linux;
 * elsewhere the fields the platform cannot answer stay empty rather than guessed.
 */
export type TerminalStatus = {
	/** The shell's working directory now (it moves with `cd`). */
	cwd: string | null;
	/** The command in the foreground, as typed; null while the shell waits at its prompt. */
	command: string | null;
	/** TCP ports a process in the terminal listens on. */
	ports: number[];
	branch: string | null;
	/** Commits on the branch not yet on its upstream; null without an upstream. */
	ahead: number | null;
	/** The last lines it printed, escape codes removed. */
	preview: string[];
};

const PREVIEW_LINES = 3;
const PREVIEW_WIDTH = 120;
/** How much of the tail is read for the preview. */
const PREVIEW_BYTES = 8 * 1024;

/** `/proc/<pid>/stat`: the fields after the command name (which may hold spaces and brackets). */
async function stat(pid: number): Promise<string[] | null> {
	try {
		const raw = await readFile(`/proc/${pid}/stat`, "utf8");
		return raw.slice(raw.lastIndexOf(")") + 2).split(" ");
	} catch {
		return null;
	}
}

/** The command line of a process, as typed. */
async function commandLine(pid: number): Promise<string | null> {
	try {
		const raw = await readFile(`/proc/${pid}/cmdline`, "utf8");
		const line = raw.split("\0").filter(Boolean).join(" ").trim();
		return line ? line.slice(0, 160) : null;
	} catch {
		return null;
	}
}

/**
 * The foreground job's command, or null at the prompt. The terminal's foreground process group
 * (`tpgid`) is the shell's own while it waits; any other group is the job running.
 */
async function foreground(shell: number): Promise<string | null> {
	const fields = await stat(shell);
	if (!fields) return null;
	// After the name: state, ppid, pgrp, session, tty_nr, tpgid.
	const pgrp = Number(fields[2]);
	const tpgid = Number(fields[5]);
	if (!Number.isFinite(tpgid) || tpgid <= 0 || tpgid === pgrp) return null;
	return commandLine(tpgid);
}

/** Every process's children, read once for all the terminals being looked at. */
export type ProcessTree = Map<number, number[]>;

async function processTree(): Promise<ProcessTree> {
	const children: ProcessTree = new Map();
	try {
		for (const name of await readdir("/proc")) {
			const pid = Number(name);
			if (!Number.isInteger(pid)) continue;
			const fields = await stat(pid);
			if (!fields) continue;
			const ppid = Number(fields[1]);
			children.set(ppid, [...(children.get(ppid) ?? []), pid]);
		}
	} catch {
		// No /proc (not Linux): no process is anyone's child, so no ports are found.
	}
	return children;
}

/** The shell and every process under it. */
function family(shell: number, parents: ProcessTree): Set<number> {
	const found = new Set([shell]);
	const queue = [shell];
	while (queue.length) {
		for (const child of parents.get(queue.pop() as number) ?? []) {
			if (found.has(child)) continue;
			found.add(child);
			queue.push(child);
		}
	}
	return found;
}

async function run(args: string[], cwd?: string): Promise<string | null> {
	try {
		const child = Bun.spawn(args, {
			cwd,
			stdout: "pipe",
			stderr: "ignore",
			env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" },
		});
		const out = await new Response(child.stdout).text();
		return (await child.exited) === 0 ? out : null;
	} catch {
		return null;
	}
}

/** Listening TCP ports, by owning process, from `ss` (only this user's processes are named). */
export function listeningPorts(ss: string, pids: ReadonlySet<number>): number[] {
	const ports = new Set<number>();
	for (const line of ss.split("\n")) {
		const local = line.trim().split(/\s+/)[3];
		const port = Number(local?.slice(local.lastIndexOf(":") + 1));
		if (!Number.isInteger(port) || port <= 0) continue;
		for (const match of line.matchAll(/pid=(\d+)/g)) {
			if (pids.has(Number(match[1]))) ports.add(port);
		}
	}
	return [...ports].sort((a, b) => a - b);
}

/** Printed bytes as the last few lines a person would read. */
export function previewLines(bytes: readonly Uint8Array[]): string[] {
	let size = 0;
	const tail: Uint8Array[] = [];
	for (let index = bytes.length - 1; index >= 0 && size < PREVIEW_BYTES; index--) {
		tail.unshift(bytes[index]);
		size += bytes[index].byteLength;
	}
	const text = new TextDecoder()
		.decode(Buffer.concat(tail))
		// oxlint-disable-next-line no-control-regex -- escape sequences are made of control characters
		.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
		// oxlint-disable-next-line no-control-regex -- as above
		.replace(/\x1b\[[0-?]*[ -/]*[@-~]|\x1b[@-_]/g, "");
	const lines = text
		.split("\n")
		// A carriage return starts the line over: only what came after the last one shows.
		.map((line) => line.replace(/\r+$/, ""))
		.map((line) => line.slice(line.lastIndexOf("\r") + 1))
		// oxlint-disable-next-line no-control-regex -- the rest of the control characters
		.map((line) => line.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "").trimEnd())
		.filter((line) => line.trim() !== "");
	return lines.slice(-PREVIEW_LINES).map((line) => line.slice(0, PREVIEW_WIDTH));
}

/** What the terminal whose shell is `pid` is doing, with `output` its kept bytes. */
export async function terminalStatus(
	pid: number | null,
	output: readonly Uint8Array[],
	machine: Machine,
): Promise<TerminalStatus> {
	const preview = previewLines(output);
	if (pid === null)
		return { cwd: null, command: null, ports: [], branch: null, ahead: null, preview };
	const [cwd, command] = await Promise.all([
		readlink(`/proc/${pid}/cwd`).catch(() => null),
		foreground(pid),
	]);
	let branch: string | null = null;
	let ahead: number | null = null;
	if (cwd) {
		const [head, count] = await Promise.all([
			run(["git", "symbolic-ref", "--quiet", "--short", "HEAD"], cwd),
			run(["git", "rev-list", "--count", "@{upstream}..HEAD"], cwd),
		]);
		branch = head?.trim() || null;
		ahead = count === null ? null : Number(count.trim());
	}
	return {
		cwd,
		command,
		ports: machine.ss === null ? [] : listeningPorts(machine.ss, family(pid, machine.tree)),
		branch,
		ahead: Number.isFinite(ahead) ? ahead : null,
		preview,
	};
}

/** What every terminal's status reads from the machine: its listening sockets and processes. */
export type Machine = { ss: string | null; tree: ProcessTree };

/** Read once per look at every terminal; `ss` is null where it is missing. */
export async function readMachine(): Promise<Machine> {
	const [ss, tree] = await Promise.all([run(["ss", "-ltnpH"]), processTree()]);
	return { ss, tree };
}
