import { effortChoices } from "./catalog";
import type { Choice } from "./events";

/**
 * Reading Freebuff's rendered screen. Freebuff is a full-screen terminal UI with no protocol, so
 * the adapter reads what a person would see: the model menu, the session line, and the reply
 * under the message it sent. Everything here is pure, so it is tested on captured screens.
 */

/** Where Freebuff says what it is doing while it works: "thinking...  3s  ■ Esc". */
const WORKING = /■ Esc\s*$/;
/** The line under a finished reply: "⎘ • 7s • △▽". */
const FOOTER = /⎘ • \d/;
/** The session line: "DeepSeek V4.1 Flash · 55m left · 13.9K (1%)". */
const SESSION = /^\s*(.+?) · (?:\d+h ?)?(?:\d+m )?left\b/;
const REASONING = /Reasoning: (\w+)\*?/;
/** Freebuff's own levels for `/reasoning`. */
const REASONING_LEVELS = ["low", "high", "max"];

/** A right-hand scrollbar is drawn into the last column; it is not part of the text. */
function clean(line: string): string {
	return line.replace(/\s*█+$/, "").trimEnd();
}

export function isWorking(lines: string[]): boolean {
	return lines.some((line) => WORKING.test(clean(line)));
}

/** Freebuff is in a session and taking messages (working or not). */
export function inSession(lines: string[]): boolean {
	return lines.some((line) => clean(line).endsWith("End session")) || isWorking(lines);
}

/** Shown in the input box while it is empty. */
const PLACEHOLDER = "Enter a coding task or / for commands";

/** What is typed in the input box (the rows between its borders), or "" while it is empty. */
export function inputText(lines: string[]): string {
	const top = lines.findLastIndex((line) => clean(line).trimStart().startsWith("╭"));
	if (top < 0) return "";
	const rows: string[] = [];
	for (const line of lines.slice(top + 1)) {
		const text = clean(line).trim();
		if (text.startsWith("╰")) break;
		rows.push(text.replace(/^│/, "").replace(/│$/, "").replace("▍", "").trim());
	}
	const typed = rows.filter(Boolean).join(" ");
	return typed === PLACEHOLDER ? "" : typed;
}

/** Ready for a message: in a session, not working, and the input box drawn and empty. */
export function isIdle(lines: string[]): boolean {
	return (
		inSession(lines) && !isWorking(lines) && lines.some((line) => clean(line).includes(PLACEHOLDER))
	);
}

/** The model of the running session, from the session line. */
export function sessionModel(lines: string[]): string | null {
	for (const line of lines) {
		const match = SESSION.exec(clean(line));
		if (match) return match[1].trim();
	}
	return null;
}

export type Menu = { models: Choice[]; selected: number; collapsed: boolean };

/**
 * The model menu shown before a session starts: each model is a box of two lines, the name line
 * (`› ` marks the highlighted one) and the cost line.
 */
export function parseMenu(lines: string[]): Menu {
	const models: Choice[] = [];
	let selected = -1;
	let collapsed = false;
	for (let i = 0; i < lines.length; i++) {
		const line = clean(lines[i]);
		if (/See all \d* ?models/i.test(line)) collapsed = true;
		const cost = clean(lines[i + 1] ?? "");
		if (!line.includes("│") || !cost.includes("Freebucks/hr")) continue;
		const label = line.split("│")[1]?.trim() ?? "";
		const highlighted = label.startsWith("›");
		const [name, ...details] = label.replace(/^›\s*/, "").split(" · ");
		if (!name) continue;
		if (highlighted) selected = models.length;
		const reasoning = REASONING.exec(label)?.[1];
		const traits = details.filter((part) => !/^(?:Reasoning:|Images$|NEW$|TEST$)/.test(part));
		const price = cost.replace(/│/g, "").trim();
		models.push({
			id: name.trim(),
			name: name.trim(),
			description: [...traits, price].join(" · "),
			...(reasoning
				? { efforts: effortChoices(REASONING_LEVELS), defaultEffort: reasoning.toLowerCase() }
				: {}),
		});
	}
	return { models, selected, collapsed };
}

/** The menu is up and settled (its footer is drawn). */
export function isMenu(lines: string[]): boolean {
	return (
		parseMenu(lines).models.length > 0 && lines.some((line) => clean(line).endsWith("History"))
	);
}

/**
 * What Freebuff shows around the menu that is not a model: the daily allowance, the wallet,
 * referral and streak perks. A free tool's own lines are kept, not hidden.
 */
export function menuNotes(lines: string[]): string[] {
	return lines
		.map((line) => clean(line).trim())
		.filter((line) =>
			/Freebucks daily|in wallet|Refer friends|Streak perk|day streak|invite link/i.test(line),
		);
}

/** Freebuff's warning while it cannot reach its service ("⚠ Couldn't get a response …"). */
export function connectionWarning(lines: string[]): string | null {
	const start = lines.findIndex((line) => clean(line).trim().startsWith("⚠"));
	if (start < 0) return null;
	const warning: string[] = [];
	for (const line of lines.slice(start)) {
		const text = clean(line).trim();
		if (!text) break;
		warning.push(text.replace(/^⚠\s*/, ""));
	}
	return warning.join(" ");
}

function squash(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

const STAMP = /^\s*\[\d{1,2}:\d{2} [AP]M\]$/;

/**
 * The text of the row where a sent message's echo ends, or null. The echo is the message under
 * its time ("[06:45 PM]"), ending in the copy mark: a copy mark elsewhere (a code block) is not one.
 */
function echoAt(lines: string[], row: number): string | null {
	const text = clean(lines[row] ?? "");
	if (!text.endsWith("⎘") || FOOTER.test(text)) return null;
	for (let i = row - 1; i >= 0 && row - i <= 40; i--) {
		const above = clean(lines[i]);
		if (STAMP.test(above)) return squash(text.slice(0, -1));
		if (!above.trim()) return null;
	}
	return null;
}

/** The row where the echo of `prompt` ends: the last message whose text ends like it. */
export function findEcho(lines: string[], prompt: string): number {
	const sent = squash(prompt);
	for (let i = lines.length - 1; i >= 0; i--) {
		const echo = echoAt(lines, i);
		if (echo && sent.endsWith(echo)) return i;
	}
	return -1;
}

/** Where a reply that starts at `from` stops: its footer, or the status and input below it. */
function replyEnd(lines: string[], from: number): { end: number; finished: boolean } {
	for (let i = from; i < lines.length; i++) {
		const line = clean(lines[i]);
		if (FOOTER.test(line)) return { end: i, finished: true };
		if (
			WORKING.test(line) ||
			line.endsWith("End session") ||
			line.trimStart().startsWith("╭") ||
			STAMP.test(line)
		)
			return { end: i, finished: false };
	}
	return { end: lines.length, finished: false };
}

function indent(line: string): number {
	return line.length - line.trimStart().length;
}

/** Trim blank rows at both ends and squeeze runs of blank rows to one. */
function tidy(rows: string[]): string {
	return rows
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.replace(/^\n+|\s+$/g, "");
}

export type Reply = { reasoning: string; text: string };

/**
 * A reply's rows as reasoning and text: "• Thinking" opens a reasoning block indented under it;
 * the answer is indented by two.
 */
export function parseReply(rows: string[]): Reply {
	const reasoning: string[] = [];
	const text: string[] = [];
	let thinking = false;
	for (const raw of rows) {
		const line = clean(raw);
		if (line.trim() === "• Thinking") {
			thinking = true;
			if (reasoning.length) reasoning.push("");
			continue;
		}
		if (thinking && (!line.trim() || indent(line) >= 4)) {
			reasoning.push(line.slice(4));
			continue;
		}
		thinking = false;
		text.push(line.slice(Math.min(2, indent(line))));
	}
	return { reasoning: tidy(reasoning), text: tidy(text) };
}

/**
 * Join what scrolled off with what is on screen now. The visible rows start somewhere inside the
 * rows seen before; the longest overlap wins, the last row seen before is ignored (it may still
 * have been growing), and repeated identical rows are kept as they are.
 */
export function mergeScrolled(previous: string[], visible: string[]): string[] {
	const stable = previous.length - 1;
	for (let start = 0; start < stable; start++) {
		const overlap = stable - start;
		if (overlap > visible.length) continue;
		let same = true;
		for (let i = 0; i < overlap && same; i++) same = previous[start + i] === visible[i];
		if (same) return [...previous.slice(0, start), ...visible];
	}
	// Nothing lines up (the reply was redrawn): assume only what no longer fits scrolled off.
	return [...previous.slice(0, Math.max(0, previous.length - visible.length)), ...visible];
}

/**
 * Follows one reply across screens. Once the echo of the sent message scrolls off the top, the
 * rows still on screen are merged with those seen before, so a long reply is not cut to its tail.
 */
export class ReplyTracker {
	private rows: string[] = [];
	/** The sent message's echo has been seen: the reply is being followed. */
	anchored = false;
	finished = false;

	constructor(private readonly prompt: string) {}

	update(lines: string[]): Reply | null {
		const echo = findEcho(lines, this.prompt);
		if (echo >= 0) {
			this.anchored = true;
			const { end, finished } = replyEnd(lines, echo + 1);
			this.rows = lines.slice(echo + 1, end);
			this.finished = finished;
		} else if (this.anchored && !lines.some((_, row) => echoAt(lines, row) !== null)) {
			// The time above the message may be gone while the message's last row is still showing.
			const sent = squash(this.prompt);
			const tail = lines.findIndex((line) => {
				const text = clean(line);
				return text.endsWith("⎘") && !FOOTER.test(text) && sent.endsWith(squash(text.slice(0, -1)));
			});
			const { end, finished } = replyEnd(lines, tail + 1);
			this.rows = mergeScrolled(this.rows, lines.slice(tail + 1, end));
			this.finished = finished;
		} else {
			return null;
		}
		return parseReply(this.rows);
	}
}
