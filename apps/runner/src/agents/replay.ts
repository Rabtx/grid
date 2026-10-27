import { readFileSync } from "node:fs";

import type { JsonProcess, Spawn } from "./stdio";

/**
 * Replaying recorded agent processes (`GRID_AGENT_RECORD_DIR`, see `stdio.ts`) for tests: a real
 * session with the real CLI, played back to Grid's real provider code without the CLI, an
 * account or the network. What the provider sends is checked against what Grid sent when it was
 * recorded; what the agent printed comes back in the same order, each part once Grid has sent
 * what came before it.
 */

export type RecordedEntry =
	| { t: number; start: { command: string[]; cwd: string } }
	| { t: number; in: unknown }
	| { t: number; out: unknown }
	| { t: number; exit: number };

export type Recording = RecordedEntry[];

export function readRecording(path: string): Recording {
	return readFileSync(path, "utf8")
		.split("\n")
		.filter((line) => line.trim())
		.map((line) => JSON.parse(line) as RecordedEntry);
}

/** Ids each run makes anew: a recorded one stands for whatever Grid sent in its place. */
const RENAMED = new Set(["uuid", "request_id", "session_id"]);

type Record_ = Record<string, unknown>;

function isObject(value: unknown): value is Record_ {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** What makes two messages the same step: their kinds, not their ids or timings. */
export function stepOf(message: unknown): string {
	if (!isObject(message)) return typeof message;
	const inner = isObject(message.request)
		? message.request
		: isObject(message.response)
			? message.response
			: {};
	const behavior = isObject(inner.response) ? inner.response.behavior : undefined;
	return [message.type, message.method, inner.subtype, behavior]
		.filter((part) => typeof part === "string")
		.join(" ");
}

function learnNames(recorded: unknown, sent: unknown, names: Map<string, string>): void {
	if (Array.isArray(recorded) && Array.isArray(sent)) {
		recorded.forEach((value, index) => learnNames(value, sent[index], names));
		return;
	}
	if (!isObject(recorded) || !isObject(sent)) return;
	for (const [key, value] of Object.entries(recorded)) {
		const other = sent[key];
		if (
			RENAMED.has(key) &&
			typeof value === "string" &&
			typeof other === "string" &&
			value &&
			other
		)
			names.set(value, other);
		else learnNames(value, other, names);
	}
}

function renamed(value: unknown, names: Map<string, string>): unknown {
	if (typeof value === "string") return names.get(value) ?? value;
	if (Array.isArray(value)) return value.map((item) => renamed(item, names));
	if (!isObject(value)) return value;
	return Object.fromEntries(
		Object.entries(value).map(([key, item]) => [key, renamed(item, names)]),
	);
}

export type Replay = {
	spawn: Spawn;
	/** Steps Grid sent that the recording did not expect, in order: empty when it replayed. */
	mismatches: string[];
	/** What Grid sent, for tests to look at. */
	sent: unknown[];
	/** Whether every recorded process was started and played to its end. */
	finished: () => boolean;
};

/**
 * A spawn that plays recorded processes back. Each started process takes the first unused
 * recording whose first message from Grid is the same step as the first message it is sent
 * (Claude Code is started for a session and, beside it, to list its commands).
 */
export function replaySpawn(recordings: Recording[]): Replay {
	const unused = [...recordings];
	const mismatches: string[] = [];
	const sent: unknown[] = [];
	const playing: { at: number; entries: RecordedEntry[] }[] = [];

	const spawn: Spawn = (_command, { onMessage }) => {
		let entries: RecordedEntry[] | null = null;
		const state = { at: 0, entries: [] as RecordedEntry[] };
		const names = new Map<string, string>();
		let ended = false;
		let exit: (code: number) => void = () => {};
		const exited = new Promise<number>((resolve) => {
			exit = resolve;
		});
		const end = (code: number) => {
			if (ended) return;
			ended = true;
			exit(code);
		};
		let running = false;
		// Everything the agent printed up to the next message Grid must send, each on its own tick.
		const play = async () => {
			if (running) return;
			running = true;
			while (entries && state.at < entries.length && !ended) {
				const entry = entries[state.at] as RecordedEntry;
				if ("in" in entry) break;
				state.at += 1;
				await new Promise((resolve) => setTimeout(resolve, 0));
				if (ended) break;
				if ("out" in entry) onMessage(renamed(entry.out, names));
				// Ended by Grid (SIGTERM) when recorded: it ends when Grid ends it here too.
				else if ("exit" in entry && entry.exit !== 143) end(entry.exit);
			}
			running = false;
		};
		const process: JsonProcess = {
			send: (message) => {
				sent.push(message);
				if (!entries) {
					const index = unused.findIndex((recording) => {
						const first = recording.find((entry) => "in" in entry);
						return first && "in" in first && stepOf(first.in) === stepOf(message);
					});
					if (index < 0) {
						mismatches.push(`no recording starts with ${stepOf(message)}`);
						return;
					}
					entries = (unused.splice(index, 1)[0] ?? []).filter((entry) => !("start" in entry));
					state.entries = entries;
					playing.push(state);
				}
				// The next message Grid sent when recorded. What the agent printed before it and has
				// not been played yet still comes first: Grid may answer before the agent is done.
				const next = entries.findIndex((entry, index) => index >= state.at && "in" in entry);
				const expected = entries[next];
				if (!expected || !("in" in expected)) {
					mismatches.push(`unexpected ${stepOf(message)}`);
					return;
				}
				if (stepOf(expected.in) !== stepOf(message))
					mismatches.push(`expected ${stepOf(expected.in)}, got ${stepOf(message)}`);
				learnNames(expected.in, message, names);
				entries.splice(next, 1);
				void play();
			},
			kill: () => end(143),
			exited,
		};
		return process;
	};

	return {
		spawn,
		mismatches,
		sent,
		finished: () =>
			unused.length === 0 &&
			playing.every((state) => state.entries.slice(state.at).every((entry) => "exit" in entry)),
	};
}

/** What is kept of Claude Code's `init` message: none of the recording machine's tools or plugins. */
const INIT_KEPT = ["type", "subtype", "cwd", "session_id", "model", "permissionMode", "uuid"];

/**
 * A recording fit to keep in the repository: the machine's paths swapped for placeholders (the
 * longest first, so a folder inside another is replaced as itself), anything like an email or a
 * credential replaced, and Claude Code's `init` message cut to what Grid reads.
 */
export function scrubRecording(text: string, replacements: Record<string, string>): string {
	const swaps = Object.entries(replacements)
		.filter(([from]) => from)
		.sort((a, b) => b[0].length - a[0].length);
	return text
		.split("\n")
		.filter((line) => line.trim())
		.map((line) => {
			const entry = JSON.parse(line) as Record<string, unknown>;
			const out = entry.out;
			if (isObject(out) && out.type === "system" && out.subtype === "init")
				entry.out = Object.fromEntries(
					INIT_KEPT.filter((key) => key in out).map((key) => [key, out[key]]),
				);
			let kept = JSON.stringify(entry);
			for (const [from, to] of swaps) kept = kept.split(from).join(to);
			return kept
				.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "person@example.com")
				.replace(/\b(sk-ant-[\w-]+|gh[pousr]_\w{20,})\b/g, "[credential]");
		})
		.join("\n")
		.concat("\n");
}
