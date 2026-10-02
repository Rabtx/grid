import { Lexer, type Token, type Tokens } from "marked";

import type { NoteBlock as Block, NoteInline as Inline, NoteListItem as ListItem } from "@/kit";
import { getApiOrigin } from "@/lib/api-client";

/*
 * A note as the document view draws it. Notes are Markdown; this reads them into a few plain
 * blocks (headings, paragraphs, lists with tasks, code, quotes, tables) so the view can draw each
 * the way the Figma note does — checkboxes you can tick, files as chips — with no HTML strings.
 */

// Backticked text that is a file path, maybe with a line: `src/jobs/eta.ts:12`, `README.md`.
const FILE_PATH =
	/^@?((?:\.{0,2}\/)?(?:[\w@.-]+\/)*[\w@-][\w.@-]*\.[a-z][a-z0-9]{0,7})(?::(\d+)(?::\d+)?)?$/i;

/** An image uploaded for a note, as the API names it. */
const NOTE_IMAGE = /^\/uploads\/notes\/[0-9a-f-]{36}\.(?:png|jpg|webp|gif)$/;

/** Links may only go to the web or mail, never `javascript:`. */
function safeHref(href: string): string | null {
	try {
		const url = new URL(href, "https://grid.invalid");
		if (url.origin === "https://grid.invalid") return null;
		return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : null;
	} catch {
		return null;
	}
}

function inline(tokens: Token[] | undefined): Inline[] {
	const out: Inline[] = [];
	for (const token of tokens ?? []) {
		switch (token.type) {
			case "strong":
			case "em":
			case "del":
				out.push({ kind: token.type, children: inline((token as Tokens.Strong).tokens) });
				break;
			case "codespan": {
				const text = (token as Tokens.Codespan).text;
				const file = text.trim().match(FILE_PATH);
				out.push(
					file
						? { kind: "file", path: file[1], line: file[2] ? Number(file[2]) : null }
						: { kind: "code", text },
				);
				break;
			}
			case "link": {
				const link = token as Tokens.Link;
				const href = safeHref(link.href);
				const children = inline(link.tokens);
				if (href) out.push({ kind: "link", href, children });
				else out.push(...children);
				break;
			}
			case "br":
				out.push({ kind: "break" });
				break;
			case "text": {
				const text = token as Tokens.Text;
				if (text.tokens?.length) out.push(...inline(text.tokens));
				else out.push({ kind: "text", text: decode(text.text) });
				break;
			}
			case "escape":
				out.push({ kind: "text", text: (token as Tokens.Escape).text });
				break;
			case "image": {
				// Only the note's own images (kept with Grid's uploads); a remote one would tell its
				// host who reads the note, so its words stand in for it.
				const image = token as Tokens.Image;
				out.push(
					NOTE_IMAGE.test(image.href)
						? { kind: "image", src: `${getApiOrigin()}${image.href}`, alt: image.text }
						: { kind: "text", text: image.text || image.href },
				);
				break;
			}
			default:
				// Raw HTML and anything else shows as the text that was written.
				out.push({ kind: "text", text: "raw" in token ? String(token.raw) : "" });
		}
	}
	return out;
}

// Marked leaves entities in plain text (it expects to write HTML); the view writes text.
function decode(text: string): string {
	return text
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, "&");
}

/**
 * Where reading has got to in the note's text. Tokens come in the text's order, so each one is
 * found after the one before it: a task's box is then the one in the text, never a look-alike in
 * a code block above it (nested and quoted tokens hold their text without its indent or `>`).
 */
type Reading = { source: string; cursor: number };

/** The first line of a token's own text, as it appears in the note. */
function firstLine(raw: string): string {
	return raw.replace(/^\n+/, "").split("\n")[0].trimStart();
}

/** Find a token in the text from where reading has got to, and move on past its first line. */
function locate(reading: Reading, raw: string): number {
	const line = firstLine(raw);
	if (!line) return -1;
	const at = reading.source.indexOf(line, reading.cursor);
	if (at < 0) return -1;
	reading.cursor = at + line.length;
	return at;
}

function blocks(tokens: Token[], reading: Reading): Block[] {
	const out: Block[] = [];
	for (const token of tokens) {
		// Code is passed over whole, so a task-like line inside it is never taken for a task.
		if (token.type === "code") {
			const raw = (token as Tokens.Code).raw;
			const start = locate(reading, raw);
			const last = raw.trimEnd().split("\n").pop()?.trim() ?? "";
			if (start >= 0 && last) {
				const end = reading.source.indexOf(last, reading.cursor);
				if (end >= 0) reading.cursor = end + last.length;
			}
		} else if (token.type !== "list" && token.type !== "blockquote" && token.type !== "space") {
			locate(reading, token.raw);
		}
		switch (token.type) {
			case "heading": {
				const heading = token as Tokens.Heading;
				out.push({ kind: "heading", level: heading.depth, content: inline(heading.tokens) });
				break;
			}
			case "paragraph":
				out.push({ kind: "paragraph", content: inline((token as Tokens.Paragraph).tokens) });
				break;
			case "text": {
				// Loose text at block level (a tight list item's words).
				const text = token as Tokens.Text;
				out.push({
					kind: "paragraph",
					content: text.tokens?.length ? inline(text.tokens) : [{ kind: "text", text: text.text }],
				});
				break;
			}
			case "list": {
				const list = token as Tokens.List;
				out.push({
					kind: "list",
					ordered: list.ordered,
					start: typeof list.start === "number" ? list.start : 1,
					items: list.items.map((item) => listItem(item, reading)),
				});
				break;
			}
			case "code": {
				const code = token as Tokens.Code;
				out.push({
					kind: "code",
					language: (code.lang ?? "").split(/\s/)[0].toLowerCase(),
					text: code.text.replace(/\n$/, ""),
				});
				break;
			}
			case "blockquote":
				out.push({ kind: "quote", blocks: blocks((token as Tokens.Blockquote).tokens, reading) });
				break;
			case "table": {
				const table = token as Tokens.Table;
				out.push({
					kind: "table",
					header: table.header.map((cell) => inline(cell.tokens)),
					rows: table.rows.map((row) => row.map((cell) => inline(cell.tokens))),
				});
				break;
			}
			case "hr":
				out.push({ kind: "rule" });
				break;
			case "space":
				break;
			default:
				if ("raw" in token && String(token.raw).trim())
					out.push({
						kind: "paragraph",
						content: [{ kind: "text", text: String(token.raw).trim() }],
					});
		}
	}
	return out;
}

function listItem(item: Tokens.ListItem, reading: Reading): ListItem {
	const start = locate(reading, item.raw);
	const task = item.task ? Boolean(item.checked) : null;
	// Where its box is in the text: the `[` after the bullet on its first line.
	let taskAt = -1;
	if (item.task && start >= 0) {
		const box = reading.source.slice(start).match(/^(?:[-*+]|\d+[.)])\s+\[[ xX]\]/);
		if (box) taskAt = start + box[0].length - 3;
	}
	// The item's first words are its line; anything after (a nested list, more paragraphs) goes under it.
	const [first, ...rest] = item.tokens.filter((token) => token.type !== "checkbox");
	let content: Inline[] = [];
	let after = item.tokens;
	if (first && (first.type === "text" || first.type === "paragraph")) {
		const words = first as Tokens.Text | Tokens.Paragraph;
		content = words.tokens?.length ? inline(words.tokens) : [{ kind: "text", text: words.text }];
		after = rest;
	}
	return { task, taskAt, content, children: blocks(after, reading) };
}

/** A note's Markdown as blocks for the document view. */
export function parseNote(markdown: string): Block[] {
	return blocks(new Lexer({ gfm: true }).lex(markdown), { source: markdown, cursor: 0 });
}

/** A Markdown line as plain words: no heading marks, emphasis, list bullets or code ticks. */
export function plainLine(line: string): string {
	return line
		.replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/, "")
		.replace(/^\[[ xX]\]\s+/, "")
		.replace(/[`*_~]/g, "")
		.trim();
}

/**
 * A note's title (its first line, as plain words) and the rest of its text. A note written here
 * starts with `# Title`; one saved from a chat starts with its first line.
 */
export function splitNote(body: string): { title: string; rest: string; firstLine: string } {
	const lines = body.split("\n");
	const at = lines.findIndex((line) => line.trim() !== "");
	if (at < 0) return { title: "", rest: "", firstLine: "" };
	const firstLine = lines[at];
	// A note that opens with code has no title line: all of it is the body.
	if (/^\s*(`{3}|~{3})/.test(firstLine)) return { title: "", rest: body.trim(), firstLine: "" };
	return {
		title: plainLine(firstLine).slice(0, 200),
		rest: lines
			.slice(at + 1)
			.join("\n")
			.replace(/^\s*\n/, "")
			.trimEnd(),
		firstLine,
	};
}

/**
 * A note's text from its title and the rest. The first line is kept as it was written unless the
 * title changed, so an agent's answer saved as a note is not rewritten by opening it.
 */
export function joinNote(original: string, title: string, rest: string): string {
	const before = splitNote(original);
	const head =
		before.firstLine && before.title === title.trim()
			? before.firstLine
			: title.trim()
				? `# ${title.trim()}`
				: "";
	const body = rest.trim();
	return head && body ? `${head}\n\n${body}` : head || body;
}

/** Tick or untick the task whose box is at `at` in the note's Markdown (see `parseNote`). */
export function toggleTask(markdown: string, at: number, done: boolean): string {
	if (at < 0 || !/^\[[ xX]\]$/.test(markdown.slice(at, at + 3))) return markdown;
	return `${markdown.slice(0, at)}[${done ? "x" : " "}]${markdown.slice(at + 3)}`;
}

/** How many of a note's tasks are done, for the list ("3 of 7 done"); null without tasks. */
export function taskCount(markdown: string): { done: number; total: number } | null {
	let total = 0;
	let done = 0;
	const walk = (list: Block[]) => {
		for (const block of list) {
			if (block.kind === "list")
				for (const item of block.items) {
					if (item.task !== null) {
						total++;
						if (item.task) done++;
					}
					walk(item.children);
				}
			else if (block.kind === "quote") walk(block.blocks);
		}
	};
	walk(parseNote(markdown));
	return total ? { done, total } : null;
}

/** A note's title and a line under it for lists: its progress when it is a checklist, else its words. */
export function noteSummary(body: string): { title: string; preview: string } {
	const { title, rest } = splitNote(body);
	// A checklist reads as its progress; a note that opens with words reads as its words.
	const opening = rest.split("\n").find((line) => line.trim() !== "") ?? "";
	const tasks = /^\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\]\s/.test(opening) ? taskCount(rest) : null;
	const lines = rest
		.split("\n")
		.filter((line) => !/^\s*(`{3}|~{3})/.test(line))
		.map(plainLine)
		.filter(Boolean);
	return {
		title: title || "Untitled note",
		preview: tasks ? `${tasks.done} of ${tasks.total} done` : lines.join(" ").slice(0, 160),
	};
}
