import { effortChoices } from "./catalog";
import type { Choice, ToolKind } from "./events";

/**
 * Reading Freebuff's rendered screen. Freebuff is a full-screen terminal UI with no protocol, so
 * the adapter reads what a person would see: the model picker, the line under the input, and the reply
 * under the message it sent. Everything here is pure, so it is tested on captured screens.
 */

/** Where Freebuff says what it is doing while it works: "thinking...  3s  ■ Esc". */
const WORKING = /■ Esc\s*$/;
/** The line under a finished reply: "⎘ • 7s • △▽". */
const FOOTER = /⎘ • \d/;
/**
 * The line under the input box: "DeepSeek V4.1 Flash • max · ~/app · /model to change · Chat: …",
 * or without the " • max" for a model with no reasoning levels.
 */
const STATUS = /^\s*(.+?)(?: • (\w+))? · .*\/model to change/;
/** The model picker's hint line, and its reasoning list's. */
const PICKER = "choose model";
const EFFORT_PICKER = "Enter save";
/** Freebuff's reasoning levels, chosen with Tab in the model picker. */
const REASONING_LEVELS = ["low", "high", "max"];

/** A right-hand scrollbar is drawn into the last column; it is not part of the text. */
function clean(line: string): string {
	return line.replace(/\s*█+$/, "").trimEnd();
}

export function isWorking(lines: string[]): boolean {
	return lines.some((line) => WORKING.test(clean(line)));
}

/** A session is running: it has time left to end (the first message starts one). */
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

/** The model picker is open (`/model`), or its reasoning list inside it. */
export function isPicker(lines: string[]): boolean {
	return lines.some((line) => clean(line).includes(PICKER));
}

export function isEffortPicker(lines: string[]): boolean {
	return lines.some((line) => clean(line).includes(EFFORT_PICKER));
}

/** Ready for a message: its input box drawn and empty, not working, no picker open. */
export function isIdle(lines: string[]): boolean {
	return (
		!isWorking(lines) &&
		!isPicker(lines) &&
		!isEffortPicker(lines) &&
		lines.some((line) => clean(line).includes(PLACEHOLDER))
	);
}

/** The model the next message goes to, and its reasoning level, from the line under the input. */
export function currentModel(lines: string[]): { model: string; effort: string | null } | null {
	for (const line of lines) {
		const match = STATUS.exec(clean(line));
		if (match) return { model: match[1].trim(), effort: match[2] ?? null };
	}
	return null;
}

/** Just the model's name. */
export function sessionModel(lines: string[]): string | null {
	return currentModel(lines)?.model ?? null;
}

export type Menu = { models: Choice[]; selected: number; collapsed: boolean };

/**
 * A model's label in the picker, in either layout Freebuff has drawn: "Claude Haiku 5.5 • medium ·
 * Anthropic · fast · Images · New", its name (with its reasoning level after " • ") then what it is
 * good at, each after " · "; or the older "DeepSeek V4.1 Flash • max  Smart & Fast · Images", with
 * a wide gap after the name.
 */
function readLabel(label: string): { name: string; effort: string | null; traits: string[] } {
	const [head = "", ...rest] = label.split(/ · |\s{2,}/);
	const [name = "", effort] = head.split(" • ");
	const traits = rest
		.map((part) => part.replace(/\s*·$/, "").trim())
		.filter((part) => part && !/^(?:Images|NEW|New|TEST)$/.test(part));
	return { name: name.trim(), effort: effort?.trim() || null, traits: [...new Set(traits)] };
}

/**
 * A model's reasoning levels. The picker shows only the default; the levels themselves are listed
 * under Tab, one model at a time, and are read there when a level is chosen. A model that
 * defaults to "medium" offers low, medium and high; the others low, high and max.
 */
function levelsFor(effort: string): string[] {
	return effort === "medium" ? ["low", "medium", "high"] : [...REASONING_LEVELS, effort];
}

/** The rows inside each box on screen (between its ┌ and └), without the side borders. */
function boxes(lines: string[]): string[][] {
	const found: string[][] = [];
	let box: string[] | null = null;
	for (const raw of lines) {
		const line = clean(raw).trim();
		if (line.startsWith("┌")) box = [];
		else if (line.startsWith("└")) {
			if (box) found.push(box);
			box = null;
		} else if (box && line.startsWith("│")) {
			box.push(line.replace(/^│/, "").replace(/│$/, "").trim());
		}
	}
	return found;
}

/**
 * The model picker: one box per model, its label (`› ` marks the highlighted one, and a long label
 * wraps onto a second row) above its cost, which may wrap too.
 */
export function parseMenu(lines: string[]): Menu {
	const models: Choice[] = [];
	let selected = -1;
	const collapsed = lines.some((line) => /See all \d* ?models/i.test(clean(line)));
	for (const rows of boxes(lines)) {
		const cost = rows.findIndex((row) => row.includes("Freebucks/hr"));
		if (cost <= 0) continue;
		const raw = rows.slice(0, cost).join(" ");
		const highlighted = raw.startsWith("›");
		const { name, effort, traits } = readLabel(raw.replace(/^›\s*/, ""));
		if (!name) continue;
		if (highlighted) selected = models.length;
		const price = rows.slice(cost).join(" ").replace(/\s+/g, " ").trim();
		models.push({
			id: name,
			name,
			description: [...traits, price].join(" · "),
			...(effort ? { efforts: effortChoices(levelsFor(effort)), defaultEffort: effort } : {}),
		});
	}
	return { models, selected, collapsed };
}

/** The picker is up and drawn. */
export function isMenu(lines: string[]): boolean {
	return parseMenu(lines).models.length > 0 && isPicker(lines);
}

/** The reasoning list (Tab in the picker): its levels in order, and the highlighted one. */
export function parseEfforts(lines: string[]): { levels: string[]; selected: number } {
	const hint = lines.findIndex((line) => clean(line).includes(EFFORT_PICKER));
	const levels: string[] = [];
	let selected = -1;
	if (hint < 0) return { levels, selected };
	for (const line of lines.slice(hint + 1)) {
		const match = /^\s*(›)?\s*(\w+)(?: \(default\))?$/.exec(clean(line));
		if (!match) break;
		if (match[1]) selected = levels.length;
		levels.push(match[2]);
	}
	return { levels, selected };
}

/**
 * What Freebuff shows that is not a model or a message: the daily allowance, the wallet, plan,
 * referral and streak perks. A free tool's own lines are kept, not hidden.
 */
export function menuNotes(lines: string[]): string[] {
	return lines
		.map((line) =>
			clean(line)
				.replace(/^\s*│/, "")
				.replace(/│\s*$/, "")
				.trim(),
		)
		.filter((line) =>
			/Freebucks (daily|remaining)|in wallet|Refer friends|Streak perk|day streak|invite link|plan$/i.test(
				line,
			),
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

/** One part of a reply as the screen shows it, in order. */
export type Segment =
	| { kind: "reasoning" | "text"; text: string }
	| { kind: "tool"; title: string; tool: ToolKind; input: string; output: string };

/**
 * The names Freebuff draws its tools under ("• Read a.ts, b.ts"), longest first so "Read URL" is
 * not read as "Read". A tool it names some other way is titled by its first word.
 */
const TOOLS: [string, ToolKind][] = (
	[
		["List service categories", "search"],
		["Report integration", "other"],
		["Search services", "search"],
		["Browse services", "search"],
		["App Connections", "other"],
		["Fetch service", "fetch"],
		["App Schemas", "other"],
		["List deeply", "search"],
		["App Search", "search"],
		["App Action", "other"],
		["Web Search", "fetch"],
		["Load Skill", "read"],
		["Read Docs", "fetch"],
		["Read URL", "fetch"],
		["Create", "edit"],
		["Delete", "edit"],
		["Search", "search"],
		["Write", "edit"],
		["Edit", "edit"],
		["Glob", "search"],
		["List", "search"],
		["Read", "read"],
	] as [string, ToolKind][]
).sort((a, b) => b[0].length - a[0].length);

function toolRow(body: string): { title: string; tool: ToolKind; input: string } {
	for (const [name, tool] of TOOLS) {
		if (body === name || body.startsWith(`${name} `))
			return { title: name, tool, input: body.slice(name.length).trim() };
	}
	const [first = "", ...rest] = body.split(" ");
	return { title: first, tool: "other", input: rest.join(" ") };
}

/** Rows that start something of their own in Markdown, never the rest of the row above. */
const OWN_ROW = /^(?:[-*+] |\d+[.)] |> |[│┌└├╭╰]|```)/;

/** The terminal broke a word after a slash or a hyphen: put the halves back together. */
function joiner(previous: string): string {
	return /\w[/-]$/.test(previous) ? "" : " ";
}

/**
 * Rows as the text they were before the terminal wrapped them. A row as long as the screen allows
 * ran on into the next one; shorter rows, blank rows and rows that start a list item, a quote or
 * a code fence keep their line breaks. `always` joins every row (a tool's input is not prose).
 */
function unwrap(rows: string[], wrapAt: number, always = false): string {
	let text = "";
	let previous: string | null = null;
	for (const row of rows) {
		const body = row.trim();
		if (previous === null) text = always ? body : row;
		else if (!body) text += "\n";
		else if (previous.trim() && (always || (previous.length >= wrapAt && !OWN_ROW.test(body))))
			text += joiner(previous.trimEnd()) + body;
		else text += `\n${always ? body : row}`;
		previous = row;
	}
	return text.replace(/\n{3,}/g, "\n\n").replace(/^\n+|\s+$/g, "");
}

/** Freebuff's own controls under a command's output. */
const CONTROL = /^(?:Show \d+ more lines?|Show fewer)$/;

type Open =
	| { kind: "reasoning" | "text"; rows: string[] }
	| { kind: "tool"; title: string; tool: ToolKind; input: string[]; output: string[] };

/**
 * A reply's rows as its parts, in order. Rows start two columns in. "• Thinking" opens reasoning,
 * indented under it; any other "• Name …" row is a tool with its input after the name (running on
 * over the rows below it), "$ command" is a command with its output under it, and the rest is the
 * answer. A blank row ends a tool. `width` is the screen's, to tell a wrapped row from a short one.
 */
export function parseSegments(rows: string[], width: number): Segment[] {
	const open: Open[] = [];
	const wrapAt = width - 40;
	for (const raw of rows) {
		const line = clean(raw);
		const body = line.trim();
		const at = indent(line);
		const current = open.at(-1);
		if (!body) {
			if (current?.kind === "tool") open.push({ kind: "text", rows: [] });
			else current?.rows.push("");
			continue;
		}
		const bullet = at <= 2 ? /^[•▸▾] (.+)$/.exec(body) : null;
		if (bullet?.[1] === "Thinking") {
			if (current?.kind === "reasoning") current.rows.push("");
			else open.push({ kind: "reasoning", rows: [] });
			continue;
		}
		if (bullet) {
			const { title, tool, input } = toolRow(bullet[1]);
			open.push({ kind: "tool", title, tool, input: input ? [input] : [], output: [] });
			continue;
		}
		if (at <= 2 && body.startsWith("$ ")) {
			open.push({
				kind: "tool",
				title: "Run",
				tool: "execute",
				input: [body.slice(2)],
				output: [],
			});
			continue;
		}
		if (current?.kind === "tool") {
			if (CONTROL.test(body)) continue;
			// A command's lines under it are its output; another tool's run on from its name.
			if (current.tool === "execute" || at > 2) current.output.push(line.slice(Math.min(4, at)));
			else current.input.push(body);
			continue;
		}
		if (current?.kind === "reasoning" && at >= 4) {
			current.rows.push(line.slice(4));
			continue;
		}
		const row = line.slice(Math.min(2, at));
		if (current?.kind === "text") current.rows.push(row);
		else open.push({ kind: "text", rows: [row] });
	}
	return open.flatMap((part): Segment[] => {
		if (part.kind === "tool")
			return [
				{
					kind: "tool",
					title: part.title,
					tool: part.tool,
					input: unwrap(part.input, wrapAt, true),
					output: part.output.join("\n").trimEnd(),
				},
			];
		const text = unwrap(part.rows, wrapAt - (part.kind === "reasoning" ? 4 : 2));
		return text ? [{ kind: part.kind, text }] : [];
	});
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
 * `width` is the screen's.
 */
export class ReplyTracker {
	private rows: string[] = [];
	/** The sent message's echo has been seen: the reply is being followed. */
	anchored = false;
	finished = false;

	constructor(
		private readonly prompt: string,
		private readonly width: number,
	) {}

	/**
	 * The reply's parts so far. While it is still being written the last row is left out: it may be
	 * half drawn.
	 */
	update(lines: string[]): Segment[] | null {
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
		return parseSegments(this.finished ? this.rows : this.rows.slice(0, -1), this.width);
	}
}
