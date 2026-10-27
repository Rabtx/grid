import type { ChatEvent, MessageOrigin } from "../agents/events";

/** How much of the earlier conversation a fresh agent is given, at most. */
const BUDGET = 12_000;
/** How much of one reply or message is kept before it is cut. */
const PER_TEXT = 2_000;
/** Of the budget, how much the first request may take: it says what the thread is for. */
const FIRST_SHARE = 0.5;
/** Commands listed per turn; the rest are counted. */
const COMMANDS_PER_TURN = 8;

/** One turn of a thread as it reads back: what was asked, what came of it. */
export type TurnRecord = {
	/** Its number in the thread, from 1. */
	n: number;
	asked: string;
	/** Who asked, when it was not the person (see `MessageOrigin`). */
	origin?: MessageOrigin;
	replied: string;
	files: string[];
	commands: { command: string; failed: boolean }[];
	/** How it ended; `open` while it goes on (or when the log was cut). */
	outcome: "done" | "cancelled" | "error" | "open";
	error?: string;
};

/** A thread's turns, oldest first: each message sent, the reply, files and commands. */
export function turnsOf(events: readonly ChatEvent[]): TurnRecord[] {
	const turns: TurnRecord[] = [];
	let turn: TurnRecord | null = null;
	const commands = new Map<string, { command: string; failed: boolean }>();
	for (const event of events) {
		if (event.type === "user") {
			commands.clear();
			turn = {
				n: turns.length + 1,
				asked: event.text.trim(),
				...(event.origin ? { origin: event.origin } : {}),
				replied: "",
				files: [],
				commands: [],
				outcome: "open",
			};
			turns.push(turn);
		} else if (!turn) {
			continue;
		} else if (event.type === "message") {
			turn.replied += event.text;
		} else if (event.type === "tool") {
			for (const diff of event.diffs ?? [])
				if (!turn.files.includes(diff.path)) turn.files.push(diff.path);
			if (event.kind === "execute" || commands.has(event.id)) {
				const known = commands.get(event.id);
				const command = event.input?.trim() || known?.command || event.title?.trim() || "";
				if (!command) continue;
				const entry = { command, failed: event.status === "failed" || known?.failed === true };
				if (!known) turn.commands.push(entry);
				else Object.assign(known, entry);
				commands.set(event.id, known ?? entry);
			}
		} else if (event.type === "turn_end") {
			turn.outcome = event.reason;
			if (event.error) turn.error = event.error;
		}
	}
	return turns;
}

/** Who a turn's message came from, as a brief names them. */
function askedBy(origin: MessageOrigin | undefined): string {
	if (!origin) return "Person";
	if (origin.kind === "grid") return "Grid";
	if (origin.kind === "merge") return `Brought back from the fork "${origin.thread.title}"`;
	if (origin.kind === "outside") return `${origin.agent} (an agent outside Grid)`;
	if (origin.kind === "guest") return `${origin.name} (a guest)`;
	return `The agent in "${origin.thread.title}"`;
}

function told(turn: TurnRecord, you: string): string {
	const lines = [`${askedBy(turn.origin)}: ${cut(turn.asked)}`];
	if (turn.replied.trim()) lines.push(`${you}: ${cut(turn.replied.trim())}`);
	if (turn.outcome === "cancelled") lines.push("(This turn was stopped before it finished.)");
	if (turn.outcome === "error")
		lines.push(`(This turn failed${turn.error ? `: ${cut(turn.error, 300)}` : "."})`);
	if (turn.files.length) lines.push(`Files changed: ${turn.files.join(", ")}`);
	if (turn.commands.length) {
		const shown = turn.commands
			.slice(0, COMMANDS_PER_TURN)
			.map((item) => `\`${cut(item.command, 160)}\`${item.failed ? " (failed)" : ""}`);
		const more = turn.commands.length - shown.length;
		lines.push(`Commands: ${shown.join(", ")}${more > 0 ? ` and ${more} more` : ""}`);
	}
	return lines.join("\n");
}

export type BriefOptions = {
	/** The most it may be, in characters. */
	budget?: number;
	/** What the agent is told first, in place of the usual "you have no memory of it". */
	intro?: string;
	/** The thread's id: turns left out can then be read with Grid's `thread_read` tool. */
	thread?: string;
	/** Tell only turns after this many (what an agent handed a thread back missed). */
	after?: number;
	/** Who the replies were by, as the agent reading it is told ("You", "The agent"). */
	you?: string;
};

/**
 * What a fresh agent is told about a thread it has no memory of: one restored from another
 * machine, handed over from another agent, a fork, or one whose agent lost its session. A
 * budgeted selection of the real conversation, not a summary: the first request (what the
 * thread is for) and then the newest turns, each with the reply, files changed and commands
 * run, including work a stopped or failed turn had done. Turns that do not fit are named, and
 * the agent can read them with Grid's `thread_read` tool. Null when there is nothing to tell.
 */
export function historyBrief(
	events: readonly ChatEvent[],
	options: BriefOptions = {},
): string | null {
	const budget = options.budget ?? BUDGET;
	const you = options.you ?? "You";
	const intro =
		options.intro ??
		"This thread began before this session, so you have no memory of it. Here is what was said, oldest first:";
	const all = turnsOf(events).filter(
		(turn) => (turn.asked || turn.replied.trim()) && turn.n > (options.after ?? 0),
	);
	if (!all.length) return null;

	const texts = all.map((turn) => told(turn, you));
	const kept = new Set<number>();
	let used = 0;
	// The first request says what the thread is for: kept when it is not too long for that.
	const [first] = texts;
	if (first !== undefined && first.length <= budget * FIRST_SHARE) {
		kept.add(0);
		used += first.length;
	}
	for (let i = texts.length - 1; i >= 0; i--) {
		if (kept.has(i)) continue;
		const text = texts[i] ?? "";
		if (used + text.length > budget && kept.size) break;
		kept.add(i);
		used += text.length;
	}

	const parts: string[] = [];
	let gap: TurnRecord[] = [];
	const closeGap = () => {
		if (!gap.length) return;
		const from = gap[0]?.n ?? 0;
		const to = gap.at(-1)?.n ?? from;
		const which = from === to ? `Turn ${from}` : `Turns ${from}–${to}`;
		const count = gap.length === 1 ? "1 earlier turn" : `${gap.length} earlier turns`;
		parts.push(
			options.thread
				? `(${which} left out. Read them with Grid's thread_read tool: thread "${options.thread}", from turn ${from}.)`
				: `(${count} left out.)`,
		);
		gap = [];
	};
	all.forEach((turn, i) => {
		if (!kept.has(i)) {
			gap.push(turn);
			return;
		}
		closeGap();
		parts.push(texts[i] ?? "");
	});
	closeGap();
	return [intro, "", parts.join("\n\n")].join("\n");
}

function cut(text: string, max = PER_TEXT): string {
	return text.length > max ? `${text.slice(0, max)}…` : text;
}
