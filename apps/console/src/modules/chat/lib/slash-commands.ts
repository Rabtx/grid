import { createMemo, createSignal } from "solid-js";

import type { AgentCommand } from "../types/chat.types";

import { matchSubsequence } from "./file-mentions";

/** Who offers a command: Grid itself, or the agent it is written to. */
export type SlashCommandKind = "grid" | "agent";

/** The name Grid's own commands are grouped under in the list. */
export const GRID = "Grid";

export type SlashCommand = {
	/** Stable key: the command's name for Grid, `<agent>:<name>` for an agent's own command. */
	id: string;
	/** The word typed after the slash. */
	name: string;
	/** The one line shown beside it. */
	description: string;
	/** The argument placeholder when the command needs one, e.g. `<level>`. */
	argument?: string;
	/** It opens a picker, which takes the keyboard from the field. */
	picker?: boolean;
	/** Who offers it: "Grid", or the agent's name. */
	group: string;
	kind: SlashCommandKind;
};

const grid = (command: Omit<SlashCommand, "group" | "kind">): SlashCommand => ({
	...command,
	group: GRID,
	kind: "grid",
});

/** Grid's commands, in the order they are listed while nothing has been typed after the slash. */
export const GRID_COMMANDS: readonly SlashCommand[] = [
	grid({ id: "new", name: "new", description: "Start a new thread in this project" }),
	grid({ id: "model", name: "model", description: "Switch the model", picker: true }),
	grid({
		id: "effort",
		name: "effort",
		description: "Set the reasoning effort",
		argument: "<level>",
	}),
	grid({
		id: "mode",
		name: "mode",
		description: "Switch the permission mode",
		picker: true,
	}),
	grid({ id: "stop", name: "stop", description: "Stop the agent's turn" }),
	grid({ id: "split", name: "split", description: "Open this thread beside its terminal" }),
	grid({ id: "task", name: "task", description: "Add a board task", argument: "<title>" }),
	grid({
		id: "note",
		name: "note",
		description: "Add a note to this project",
		argument: "<text>",
	}),
	grid({ id: "clear", name: "clear", description: "Clear the composer" }),
];

const GRID_NAMES = new Set(GRID_COMMANDS.map((command) => command.name));

/**
 * The agent's own commands, as the composer's list. They sit under the agent's name and are sent
 * to it as typed. A name Grid also has is the agent's, not Grid's: it is listed and typed with the
 * agent's id in front, and the runner takes that off again before the agent sees it.
 */
export function agentCommands(
	commands: readonly AgentCommand[],
	agent: { id: string; name: string },
): SlashCommand[] {
	return commands.map((command) => ({
		id: `${agent.id}:${command.name}`,
		name: GRID_NAMES.has(command.name.toLowerCase()) ? `${agent.id}:${command.name}` : command.name,
		description: command.description,
		...(command.hint ? { argument: command.hint } : {}),
		group: agent.name,
		kind: "agent",
	}));
}

/** What a composer can offer right now: a running turn, a catalog, a project to file into. */
export type SlashCommandContext = {
	running: boolean;
	models: boolean;
	modes: boolean;
	efforts: boolean;
	project: boolean;
	/** A thread is open, with a workspace to split into. */
	split?: boolean;
};

// A command whose context is missing (no catalog, nothing running) is hidden, not offered and
// then refused. An agent's own command has no entry here and always applies.
const APPLIES: Record<string, (context: SlashCommandContext) => boolean> = {
	new: (context) => context.project,
	model: (context) => context.models,
	effort: (context) => context.efforts,
	mode: (context) => context.modes,
	stop: (context) => context.running,
	split: (context) => Boolean(context.split),
	task: (context) => context.project,
	note: (context) => context.project,
	clear: () => true,
};

/**
 * The commands that make sense here: Grid's, then the agent's own after them. Pass the agent's
 * commands as `extra` — they are listed under their agent's name and sent to it as typed.
 */
export function availableCommands(
	context: SlashCommandContext,
	extra: readonly SlashCommand[] = [],
): SlashCommand[] {
	return [...GRID_COMMANDS, ...extra].filter((command) => APPLIES[command.id]?.(context) ?? true);
}

/**
 * The active `/` query: the slash must start the composer (nothing but whitespace before it) and
 * the query cannot contain whitespace yet — a space means the reader has moved on to the argument.
 */
export function findSlashQuery(
	text: string,
	cursorPosition: number,
): { slashIndex: number; query: string } | null {
	if (cursorPosition <= 0 || cursorPosition > text.length) return null;
	const before = text.slice(0, cursorPosition);
	const slashIndex = before.indexOf("/");
	if (slashIndex === -1) return null;
	// Leading whitespace is allowed; text before the slash is not.
	if (before.slice(0, slashIndex).trim() !== "") return null;
	const query = before.slice(slashIndex + 1);
	if (/\s/.test(query)) return null;
	return { slashIndex, query };
}

/** How well a command matches: lower is better, -1 means it does not match at all. */
function scoreCommand(command: SlashCommand, query: string): number {
	const name = command.name.toLowerCase();
	if (name === query) return 0;
	if (name.startsWith(query)) return 1;
	if (name.includes(query)) return 2;
	if (command.description.toLowerCase().includes(query)) return 3;
	if (matchSubsequence(name, query)) return 4;
	return -1;
}

/** Commands matching what has been typed, best name match first and then alphabetically. */
export function filterCommands(commands: readonly SlashCommand[], query: string): SlashCommand[] {
	const wanted = query.trim().toLowerCase();
	if (!wanted) return [...commands];
	return commands
		.map((command) => ({ command, score: scoreCommand(command, wanted) }))
		.filter((entry) => entry.score >= 0)
		.sort((a, b) => a.score - b.score || a.command.name.localeCompare(b.command.name))
		.map((entry) => entry.command);
}

export type ParsedSlashCommand = { command: SlashCommand; argument: string };

/**
 * A Grid command a whole composer message starts with, and its argument. Only Grid's own commands
 * are recognised: anything else, an agent's own command included, is left to be sent as typed.
 * So is a command that takes no argument with words after it: `/new landing page ideas` is a
 * message, not `/new`.
 */
export function parseSlashCommand(
	text: string,
	commands: readonly SlashCommand[],
): ParsedSlashCommand | null {
	const trimmed = text.trimStart();
	const match = /^\/([a-z0-9-]+)(?:\s+([\s\S]*))?$/i.exec(trimmed);
	if (!match) return null;
	const name = match[1].toLowerCase();
	const command = commands.find(
		(candidate) => candidate.kind === "grid" && candidate.name.toLowerCase() === name,
	);
	if (!command) return null;
	const argument = (match[2] ?? "").trim();
	if (argument && !command.argument) return null;
	return { command, argument };
}

/**
 * Swap the typed `/query` for the chosen command. One that needs an argument — or an agent's own
 * command, which is sent as typed — becomes `/name ` with the cursor after it; one Grid runs on
 * its own is taken out of the field.
 */
export function insertCommand(
	text: string,
	slashIndex: number,
	cursorPosition: number,
	command: SlashCommand,
): { text: string; cursorPosition: number } {
	const before = text.slice(0, slashIndex);
	const after = text.slice(cursorPosition);
	const typed = command.kind === "agent" || command.argument ? `/${command.name} ` : "";
	const next = `${before}${typed}${after}`;
	return { text: next, cursorPosition: before.length + typed.length };
}

/** What the composer should do with a whole message that starts with a slash. */
export type SlashSendAction = "send" | "handled" | "keep";

export type SlashCommandsOptions = {
	/** The field the query is read from and the command written back into. */
	textarea: () => HTMLTextAreaElement | undefined;
	/** The commands listed right now: Grid's that apply here, plus the agent's own. */
	commands: () => readonly SlashCommand[];
	value: () => string;
	onChange: (next: string) => void;
	/**
	 * Run a command; return false to keep the typed text so the reader can finish it. A typed Grid
	 * command reaches it even when it is not listed here, so it can say why it does not apply.
	 */
	run: (command: SlashCommand, argument: string) => boolean;
};

export type SlashCommandsReturn = {
	open: () => boolean;
	query: () => string;
	matches: () => SlashCommand[];
	selectedIndex: () => number;
	selectCommand: (command: SlashCommand) => void;
	close: () => void;
	/** Re-read the field: after typing, or after the cursor moves. */
	handleInput: () => void;
	handleKeyDown: (event: KeyboardEvent) => boolean;
	/** Before sending: run a Grid command instead, or leave the text for the agent. */
	handleSend: (text: string) => SlashSendAction;
};

/**
 * The `/` menu's brain, mirroring `useFileMentions`: it opens on a slash at the start of the
 * field, filters as you type, and answers arrows, Enter/Tab and Escape. The field keeps the
 * keyboard; picking only moves the cursor and the text.
 */
export function useSlashCommands(options: SlashCommandsOptions): SlashCommandsReturn {
	const [open, setOpen] = createSignal(false);
	const [query, setQuery] = createSignal("");
	const [slashIndex, setSlashIndex] = createSignal(-1);
	const [selectedIndex, setSelectedIndex] = createSignal(0);

	// The slash position that Escape dismissed, so it stays closed until the reader changes it.
	let dismissedAtIndex = -1;

	const matches = createMemo(() => filterCommands(options.commands(), query()));

	function close(): void {
		setOpen(false);
		dismissedAtIndex = slashIndex();
	}

	function place(cursor: number, command: SlashCommand): void {
		const textarea = options.textarea();
		// A picker it opened has the keyboard now; taking it back would close it.
		if (command.picker) return;
		queueMicrotask(() => {
			textarea?.focus();
			textarea?.setSelectionRange(cursor, cursor);
		});
	}

	function selectCommand(command: SlashCommand): void {
		const textarea = options.textarea();
		const at = slashIndex();
		const current = options.value();
		const cursor = textarea?.selectionStart ?? current.length;

		close();

		// Grid's own command that runs on its own: take it out of the field and run it.
		if (command.kind === "grid" && !command.argument) {
			if (!options.run(command, "")) return;
			const result = insertCommand(current, at, cursor, command);
			options.onChange(result.text);
			place(result.cursorPosition, command);
			return;
		}

		// One that needs an argument (or an agent's own): type it out, cursor after it.
		const result = insertCommand(current, at, cursor, command);
		options.onChange(result.text);
		place(result.cursorPosition, command);
	}

	function check(): void {
		const textarea = options.textarea();
		if (!textarea) {
			setOpen(false);
			return;
		}
		const cursor = textarea.selectionStart ?? 0;
		if (cursor !== (textarea.selectionEnd ?? 0)) {
			setOpen(false);
			return;
		}
		const match = findSlashQuery(textarea.value, cursor);
		if (!match) {
			setOpen(false);
			dismissedAtIndex = -1;
			return;
		}
		if (match.slashIndex === dismissedAtIndex && match.query === query() && !open()) return;
		if (options.commands().length === 0) {
			setOpen(false);
			return;
		}
		const changed = match.query !== query() || match.slashIndex !== slashIndex();
		setSlashIndex(match.slashIndex);
		setQuery(match.query);
		setOpen(true);
		if (changed) {
			dismissedAtIndex = -1;
			setSelectedIndex(0);
		}
	}

	function handleKeyDown(event: KeyboardEvent): boolean {
		if (!open()) return false;
		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			close();
			return true;
		}
		const items = matches();
		if (items.length === 0) return false;
		if (event.key === "ArrowDown") {
			event.preventDefault();
			setSelectedIndex((index) => (index + 1) % items.length);
			return true;
		}
		if (event.key === "ArrowUp") {
			event.preventDefault();
			setSelectedIndex((index) => (index - 1 + items.length) % items.length);
			return true;
		}
		// Enter while an input method is composing belongs to it, not the list.
		if ((event.key === "Enter" || event.key === "Tab") && !event.isComposing) {
			event.preventDefault();
			event.stopPropagation();
			const command = items[selectedIndex()];
			if (command) selectCommand(command);
			return true;
		}
		return false;
	}

	function handleSend(text: string): SlashSendAction {
		// All of Grid's commands, not just those listed: `/stop` while idle is answered, not sent.
		const parsed = parseSlashCommand(text, GRID_COMMANDS);
		if (!parsed) return "send";
		return options.run(parsed.command, parsed.argument) ? "handled" : "keep";
	}

	return {
		open,
		query,
		matches,
		selectedIndex,
		selectCommand,
		close,
		handleInput: check,
		handleKeyDown,
		handleSend,
	};
}
