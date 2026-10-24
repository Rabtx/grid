import { createSignal, onSettled } from "solid-js";

/**
 * Every keyboard command in the console, in one place: what it is called, the keys it starts on,
 * and the keys this person moved it to (Settings → Keybindings, kept per device in localStorage).
 * Screens register what a command does while they are shown (`useCommand`); one listener on the
 * document turns a key press into the command bound to it.
 *
 * A binding is a chord ("mod+k", "alt+shift+t": `mod` is ⌘ on a Mac and Ctrl elsewhere) or a
 * sequence of plain keys ("g b"). Chords work everywhere, even while typing or in a terminal;
 * plain keys and sequences never fire in a field, a terminal or under an open dialog.
 */
export type CommandGroup = "General" | "Navigation" | "Tabs" | "Chat" | "View" | "Lists";

export type Command = {
	id: string;
	label: string;
	group: CommandGroup;
	defaults: readonly string[];
};

export const COMMANDS = [
	{ id: "palette.toggle", label: "Search and Ask Grid", group: "General", defaults: ["mod+k"] },
	{ id: "settings.open", label: "Open settings", group: "General", defaults: ["mod+,"] },
	{ id: "shortcuts.show", label: "Show shortcuts", group: "General", defaults: ["?"] },
	{ id: "voice.toggle", label: "Dictate", group: "General", defaults: ["mod+shift+space"] },
	{ id: "go.board", label: "Go to board", group: "Navigation", defaults: ["g b"] },
	{ id: "go.chat", label: "Go to chat", group: "Navigation", defaults: ["g c"] },
	{ id: "go.terminal", label: "Go to terminal", group: "Navigation", defaults: ["g t"] },
	{ id: "go.settings", label: "Go to settings", group: "Navigation", defaults: ["g s"] },
	{ id: "task.new", label: "New task", group: "Lists", defaults: ["c", "n"] },
	{ id: "tasks.filter", label: "Filter tasks", group: "Lists", defaults: ["/"] },
	{ id: "list.next", label: "Next item", group: "Lists", defaults: ["j"] },
	{ id: "list.previous", label: "Previous item", group: "Lists", defaults: ["k"] },
	{ id: "list.done", label: "Mark done", group: "Lists", defaults: ["e"] },
	// Browsers keep Ctrl/⌘ with W, T, Tab and the digits for their own tabs, so Grid's use Alt.
	{ id: "tab.new", label: "New chat tab", group: "Tabs", defaults: ["alt+t"] },
	{ id: "tab.close", label: "Close tab", group: "Tabs", defaults: ["alt+w"] },
	{ id: "tab.reopen", label: "Reopen closed tab", group: "Tabs", defaults: ["alt+shift+t"] },
	{ id: "tab.next", label: "Next tab", group: "Tabs", defaults: ["alt+]"] },
	{ id: "tab.previous", label: "Previous tab", group: "Tabs", defaults: ["alt+["] },
	...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({
		id: `tab.go${n}`,
		label: n === 9 ? "Go to last tab" : `Go to tab ${n}`,
		group: "Tabs" as const,
		defaults: [`alt+${n}`],
	})),
	{
		id: "composer.focus",
		label: "Focus the message box",
		group: "Chat",
		defaults: ["mod+shift+l"],
	},
	{ id: "chat.side", label: "Open a side chat", group: "Chat", defaults: ["mod+alt+s"] },
	{
		id: "browser.toggle",
		label: "Show or hide the browser",
		group: "View",
		defaults: ["mod+shift+b"],
	},
	{ id: "zoom.in", label: "Zoom in", group: "View", defaults: ["mod+=", "mod+shift+="] },
	{ id: "zoom.out", label: "Zoom out", group: "View", defaults: ["mod+-"] },
	{ id: "zoom.reset", label: "Actual size", group: "View", defaults: ["mod+0"] },
] as const satisfies readonly Command[];

export type CommandId = (typeof COMMANDS)[number]["id"];

const STORAGE_KEY = "grid.keybindings";
const SEQUENCE_TIMEOUT_MS = 1_000;
const MODIFIERS = ["mod", "alt", "shift"] as const;

type Overrides = Partial<Record<CommandId, string[]>>;

function readOverrides(): Overrides {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== "object") return {};
		const known = new Set<string>(COMMANDS.map((command) => command.id));
		const out: Overrides = {};
		for (const [id, chords] of Object.entries(parsed)) {
			if (known.has(id) && Array.isArray(chords))
				out[id as CommandId] = chords.filter((chord): chord is string => typeof chord === "string");
		}
		return out;
	} catch {
		return {};
	}
}

// `current` is the source of truth, read at once by the listener; the signal lets screens react.
// Solid 2 batches signal writes until the next microtask.
let current: Overrides = readOverrides();
const [version, setVersion] = createSignal(0);

function overrides(): Overrides {
	version();
	return current;
}

function save(next: Overrides): void {
	current = next;
	setVersion((n) => n + 1);
	try {
		if (Object.keys(next).length) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
		else localStorage.removeItem(STORAGE_KEY);
	} catch (cause) {
		console.warn("[keybindings] could not save", cause);
	}
}

export function command(id: CommandId): Command {
	return COMMANDS.find((entry) => entry.id === id) as Command;
}

/** The keys a command is on now: this person's choice, or its defaults. */
export function bindings(id: CommandId): readonly string[] {
	return overrides()[id] ?? command(id).defaults;
}

export function isCustomised(id: CommandId): boolean {
	return overrides()[id] !== undefined;
}

/** Put a command on these keys (an empty list leaves it on none), moving them off any other. */
export function setBindings(id: CommandId, chords: readonly string[]): void {
	const wanted = chords.map(normalizeChord).filter(Boolean);
	const next: Overrides = { ...overrides(), [id]: wanted };
	for (const other of COMMANDS) {
		if (other.id === id) continue;
		const current = next[other.id] ?? other.defaults;
		const kept = current.filter((chord) => !wanted.includes(chord));
		if (kept.length !== current.length) next[other.id] = kept;
	}
	save(next);
}

export function resetBindings(id: CommandId): void {
	const next = { ...overrides() };
	delete next[id];
	save(next);
}

export function resetAllBindings(): void {
	save({});
}

/** The commands sharing a key with another, by key: what the settings screen warns about. */
export function conflicts(): Map<string, CommandId[]> {
	const byChord = new Map<string, CommandId[]>();
	for (const entry of COMMANDS) {
		for (const chord of bindings(entry.id))
			byChord.set(chord, [...(byChord.get(chord) ?? []), entry.id]);
	}
	for (const [chord, ids] of byChord) if (ids.length < 2) byChord.delete(chord);
	return byChord;
}

/** Modifiers in one order, so "shift+mod+K" and "mod+shift+k" are the same binding. */
export function normalizeChord(chord: string): string {
	return chord
		.trim()
		.toLowerCase()
		.split(" ")
		.filter(Boolean)
		.map((step) => {
			const parts = step === "+" ? ["+"] : step.split("+").filter(Boolean);
			if (step.endsWith("++")) parts.push("+");
			const key = parts.pop() ?? "";
			const mods = MODIFIERS.filter((mod) => parts.includes(mod));
			return [...mods, key].join("+");
		})
		.join(" ");
}

// Physical keys read by position when a modifier is held: Alt+W on a Mac types "∑", Alt+] "‘".
const CODE_KEYS: Record<string, string> = {
	Space: "space",
	Minus: "-",
	Equal: "=",
	BracketLeft: "[",
	BracketRight: "]",
	Backslash: "\\",
	Semicolon: ";",
	Quote: "'",
	Comma: ",",
	Period: ".",
	Slash: "/",
	Backquote: "`",
};

const NAMED_KEYS: Record<string, string> = {
	" ": "space",
	ArrowUp: "up",
	ArrowDown: "down",
	ArrowLeft: "left",
	ArrowRight: "right",
	Escape: "escape",
	Enter: "enter",
	Tab: "tab",
	Backspace: "backspace",
	Delete: "delete",
};

/** The chord a key press makes, or null for a lone modifier. */
export function chordOf(event: KeyboardEvent): string | null {
	if (["Control", "Meta", "Alt", "Shift", "AltGraph", "CapsLock"].includes(event.key)) return null;
	const mod = event.ctrlKey || event.metaKey;
	const chorded = mod || event.altKey;
	let key: string;
	const letter = /^Key([A-Z])$/.exec(event.code)?.[1];
	const digit = /^Digit(\d)$/.exec(event.code)?.[1];
	if (chorded && (letter || digit)) key = (letter ?? digit ?? "").toLowerCase();
	else if (chorded && CODE_KEYS[event.code]) key = CODE_KEYS[event.code] ?? "";
	else
		key =
			NAMED_KEYS[event.key] ??
			(event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase());
	// A printed character already says Shift ("?" is Shift+/), so plain keys leave it out.
	const shift = event.shiftKey && (chorded || key.length > 1);
	return [mod && "mod", event.altKey && "alt", shift && "shift", key].filter(Boolean).join("+");
}

/** A binding as the keys to press on this device: "mod+shift+k" is ⌘ ⇧ K on a Mac. */
export function chordLabel(chord: string): string[][] {
	const apple = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
	return chord.split(" ").map((step) =>
		normalizeChord(step)
			.split(/\+(?!$)/)
			.map((part) => {
				if (part === "mod") return apple ? "⌘" : "Ctrl";
				if (part === "alt") return apple ? "⌥" : "Alt";
				if (part === "shift") return apple ? "⇧" : "Shift";
				if (part === "space") return "Space";
				return part.length === 1 ? part.toUpperCase() : part[0]?.toUpperCase() + part.slice(1);
			}),
	);
}

type Handler = { run: () => boolean | void };
const handlers = new Map<CommandId, Handler[]>();

/**
 * What a command does while the caller is shown. The newest registration wins; returning false
 * passes the key on to the one before it (a list that is not in view). Returns the unregister.
 */
export function registerCommand(id: CommandId, run: () => boolean | void): () => void {
	const handler = { run };
	handlers.set(id, [...(handlers.get(id) ?? []), handler]);
	return () =>
		handlers.set(
			id,
			(handlers.get(id) ?? []).filter((entry) => entry !== handler),
		);
}

/** `registerCommand` for as long as the calling component is shown. */
export function useCommand(id: CommandId, run: () => boolean | void): void {
	onSettled(() => registerCommand(id, run));
}

/** Run a command from a button or the palette, as its keys would. True when something ran it. */
export function runCommand(id: CommandId): boolean {
	const stack = handlers.get(id) ?? [];
	for (let index = stack.length - 1; index >= 0; index--) {
		if (stack[index]?.run() !== false) return true;
	}
	return false;
}

const editableSelector = "input, textarea, select, [contenteditable=true], [contenteditable='']";

function quietTarget(target: EventTarget | null): boolean {
	return target instanceof Element && Boolean(target.closest(`${editableSelector}, .xterm`));
}

/**
 * Listen for every binding on the document. Capture phase, so a chord still works while the
 * terminal (which eats keys) has focus. Returns the cleanup.
 */
export function installKeybindings(target: Document = document): () => void {
	let sequence: string | undefined;
	let sequenceAt = 0;

	const find = (chord: string): CommandId[] =>
		COMMANDS.filter((entry) => bindings(entry.id).includes(chord)).map((entry) => entry.id);
	const fire = (event: KeyboardEvent, ids: CommandId[]): boolean => {
		for (const id of ids) {
			if (runCommand(id)) {
				event.preventDefault();
				event.stopPropagation();
				return true;
			}
		}
		return false;
	};

	const onKeydown = (event: KeyboardEvent) => {
		if (event.defaultPrevented || event.isComposing) return;
		const chord = chordOf(event);
		if (!chord) return;
		if (chord.includes("+") && (event.ctrlKey || event.metaKey || event.altKey)) {
			if (!event.repeat || chord.startsWith("mod+=") || chord.startsWith("mod+-"))
				fire(event, find(chord));
			return;
		}
		if (quietTarget(event.target) || event.repeat) return;
		if (target.querySelector("dialog[open]")) return;
		if (typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches) return;

		const now = Date.now();
		if (sequence && now - sequenceAt <= SEQUENCE_TIMEOUT_MS) {
			const combined = `${sequence} ${chord}`;
			sequence = undefined;
			if (fire(event, find(combined))) return;
		}
		if (fire(event, find(chord))) return;
		const starts = COMMANDS.some((entry) =>
			bindings(entry.id).some((binding) => binding.startsWith(`${chord} `)),
		);
		sequence = starts ? chord : undefined;
		sequenceAt = now;
	};

	target.addEventListener("keydown", onKeydown, { capture: true });
	return () => target.removeEventListener("keydown", onKeydown, { capture: true });
}
