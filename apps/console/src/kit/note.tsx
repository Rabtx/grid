import CheckmarkSquare02Icon from "@hugeicons/core-free-icons/CheckmarkSquare02Icon";
import FileEditIcon from "@hugeicons/core-free-icons/FileEditIcon";
import Layers01Icon from "@hugeicons/core-free-icons/Layers01Icon";
import type { JSX } from "@solidjs/web";
import { For, Match, onSettled, Show, Switch } from "solid-js";

import { AgentLogo, Avatar } from "./avatar";
import { attachContextMenu, type MenuPoint } from "./context-menu";
import { EntryIcon } from "./file-icon";
import { tap } from "./haptics";
import {
	BoltIcon,
	CalendarIcon,
	CheckIcon,
	ChatIcon,
	CodeIcon,
	FlagIcon,
	GlobeIcon,
	Icon,
	type IconData,
	NoteIcon,
	SendIcon,
	SearchIcon,
	ShieldIcon,
} from "./icons";

/* ------------------------------------------------------------------------------------------
 * Figma 14 · Notes. A project's notes: a list with pinned ones on top, and the note as a
 * document — its title, who changed it, a format bar, and the text with tasks you tick and
 * files as chips.
 * ---------------------------------------------------------------------------------------- */

/** The glyphs a note can wear, each on its own tint. */
export const NOTE_GLYPHS = [
	"note",
	"flag",
	"layers",
	"rules",
	"check",
	"calendar",
	"bolt",
	"code",
	"globe",
	"shield",
] as const;
export type NoteGlyphName = (typeof NOTE_GLYPHS)[number];

const PLAIN = "bg-fill text-fg-muted ring-line";

const GLYPH: Record<NoteGlyphName, { draw: () => JSX.Element; tint: string; label: string }> = {
	note: { draw: () => <NoteIcon size="sm" />, tint: PLAIN, label: "Note" },
	flag: { draw: () => <FlagIcon size="sm" />, tint: "tint-accent", label: "Brief" },
	layers: { draw: () => <Glyph icon={Layers01Icon} />, tint: "tint-violet", label: "Architecture" },
	rules: { draw: () => <Glyph icon={FileEditIcon} />, tint: "tint-warning", label: "Rules" },
	check: {
		draw: () => <Glyph icon={CheckmarkSquare02Icon} />,
		tint: "tint-success",
		label: "Checklist",
	},
	calendar: { draw: () => <CalendarIcon size="sm" />, tint: PLAIN, label: "Meeting" },
	bolt: { draw: () => <BoltIcon size="sm" />, tint: PLAIN, label: "Ideas" },
	code: { draw: () => <CodeIcon size="sm" />, tint: "tint-accent", label: "Code" },
	globe: { draw: () => <GlobeIcon size="sm" />, tint: "tint-violet", label: "Product" },
	shield: { draw: () => <ShieldIcon size="sm" />, tint: "tint-success", label: "Security" },
};

function Glyph(props: { icon: IconData }): JSX.Element {
	return <Icon icon={props.icon} size="sm" />;
}

const glyph = (name: string) => GLYPH[name as NoteGlyphName] ?? GLYPH.note;

/** A note's glyph on its tinted tile: `sm` (20px) in the panel, `md` (28px) in lists and cards. */
export function NoteGlyph(props: { icon: string; size?: "sm" | "md" }): JSX.Element {
	return (
		<span
			aria-hidden="true"
			class={`grid shrink-0 place-items-center ${glyph(props.icon).tint} ${props.size === "md" ? "size-7 rounded-kit-md [&_svg]:size-4" : "size-5 rounded-kit-sm [&_svg]:size-3"}`}
		>
			{glyph(props.icon).draw()}
		</span>
	);
}

/** Pick a note's glyph: its tiles in a row, the chosen one ringed. */
export function NoteGlyphChoices(props: {
	label: string;
	value: string;
	onChange: (icon: NoteGlyphName) => void;
}): JSX.Element {
	return (
		<fieldset class="flex min-w-0 flex-wrap gap-1 border-0 p-1">
			<legend class="sr-only">{props.label}</legend>
			<For each={NOTE_GLYPHS}>
				{(icon) => (
					<button
						type="button"
						aria-label={GLYPH[icon].label}
						title={GLYPH[icon].label}
						aria-pressed={props.value === icon ? "true" : "false"}
						onClick={() => {
							tap();
							props.onChange(icon);
						}}
						class="focus-ring rounded-kit-lg p-1 opacity-70 transition-opacity duration-fast hover:opacity-100 aria-pressed:opacity-100 aria-pressed:ring-2 aria-pressed:ring-accent pointer-coarse:p-1.5"
					>
						<NoteGlyph icon={icon} size="md" />
					</button>
				)}
			</For>
		</fieldset>
	);
}

/** The small mark that says a note is given to agents: the agent's logo, 12px. */
function SharedMark(): JSX.Element {
	return (
		<span title="Shared with agents" class="shrink-0">
			<AgentLogo id="claude" name="Claude Code" class="size-3" />
			<span class="sr-only">Shared with agents</span>
		</span>
	);
}

/** A caption over a group of notes: Pinned, Recent. */
export function NoteGroupLabel(props: { children: JSX.Element; phone?: boolean }): JSX.Element {
	return (
		<h3
			class={`font-medium text-caption text-fg-subtle ${props.phone ? "px-4 pt-3 pb-1" : "px-2 pt-2 pb-1"}`}
		>
			{props.children}
		</h3>
	);
}

type RowProps = {
	href: string;
	title: string;
	/** Under the title: its first words, or how far its checklist is. */
	preview: string;
	/** When it was last changed, short: 2m, 1h. */
	time: string;
	icon: string;
	shared: boolean;
	current?: boolean;
	/** For pointers: a ⋯ menu on hover. Touch opens the same menu with a long press. */
	actions?: JSX.Element;
	onMenuAt?: (point: MenuPoint) => void;
};

/** A note in the panel (Figma Notes panel row, 54px): glyph, title and time, preview and mark. */
export function NotePanelRow(props: RowProps): JSX.Element {
	let row: HTMLDivElement | undefined;
	onSettled(() => {
		const open = props.onMenuAt;
		return row && open ? attachContextMenu(row, open) : undefined;
	});
	return (
		<div
			ref={(el) => {
				row = el;
			}}
			class="group/row relative select-none [-webkit-touch-callout:none]"
		>
			<a
				href={props.href}
				aria-current={props.current ? "page" : undefined}
				class="focus-ring flex min-w-0 items-start gap-2 rounded-kit-md p-2 transition-colors duration-fast hover:bg-fill aria-[current=page]:bg-fill-strong"
			>
				<NoteGlyph icon={props.icon} />
				<span class="flex min-w-0 flex-1 flex-col gap-0.5">
					<span class="flex min-w-0 items-center gap-1">
						<span class="min-w-0 flex-1 truncate font-medium text-body text-fg">{props.title}</span>
						<span class="shrink-0 text-caption text-fg-subtle tabular-nums group-hover/row:invisible group-focus-within/row:invisible pointer-coarse:visible">
							{props.time}
						</span>
					</span>
					<span class="flex min-w-0 items-center gap-1">
						<span class="min-w-0 flex-1 truncate text-caption text-fg-subtle">{props.preview}</span>
						<Show when={props.shared}>
							<SharedMark />
						</Show>
					</span>
				</span>
			</a>
			<Show when={props.actions}>
				<div class="absolute top-1.5 right-1.5 opacity-0 transition-opacity duration-fast group-hover/row:opacity-100 focus-within:opacity-100 pointer-coarse:pointer-events-none pointer-coarse:opacity-0">
					{props.actions}
				</div>
			</Show>
		</div>
	);
}

/** A note in the phone list (Figma Notes — Mobile, 60px): glyph, title and time, preview and mark. */
export function NoteListRow(props: RowProps): JSX.Element {
	let row: HTMLLIElement | undefined;
	onSettled(() => {
		const open = props.onMenuAt;
		return row && open ? attachContextMenu(row, open) : undefined;
	});
	return (
		<li
			ref={(el) => {
				row = el;
			}}
			class="group/row select-none [-webkit-touch-callout:none]"
		>
			<a
				href={props.href}
				aria-current={props.current ? "page" : undefined}
				class="focus-ring flex min-w-0 items-center gap-3 px-4 transition-colors duration-fast hover:bg-fill active:bg-fill aria-[current=page]:bg-fill"
			>
				<NoteGlyph icon={props.icon} size="md" />
				<span class="flex min-h-15 min-w-0 flex-1 flex-col justify-center gap-0.5 border-line border-b group-last/row:border-b-0">
					<span class="flex min-w-0 items-center gap-1.5">
						<span class="min-w-0 flex-1 truncate font-medium text-body-lg text-fg">
							{props.title}
						</span>
						<span class="shrink-0 text-caption text-fg-subtle tabular-nums">{props.time}</span>
					</span>
					<span class="flex min-w-0 items-center gap-1">
						<span class="min-w-0 flex-1 truncate text-caption text-fg-subtle">{props.preview}</span>
						<Show when={props.shared}>
							<SharedMark />
						</Show>
					</span>
				</span>
			</a>
		</li>
	);
}

/** A pinned note as a card (Figma Notes — Mobile, Pinned): glyph on top, title and preview under it. */
export function NoteCard(props: {
	href: string;
	title: string;
	preview: string;
	icon: string;
}): JSX.Element {
	return (
		<a
			href={props.href}
			class="focus-ring surface-card flex min-w-0 flex-col gap-3 rounded-kit-xl p-3 transition-colors duration-fast hover:bg-fill active:bg-fill"
		>
			<NoteGlyph icon={props.icon} size="md" />
			<span class="flex min-w-0 flex-col gap-0.5">
				<span class="truncate font-medium text-body-lg text-fg">{props.title}</span>
				<span class="truncate text-caption text-fg-subtle">{props.preview || " "}</span>
			</span>
		</a>
	);
}

/** Search the notes (Figma Notes — Mobile, Search): a pill with a glass; quieter in the panel. */
export function NoteSearchField(props: {
	label: string;
	placeholder: string;
	value: string;
	onInput: (value: string) => void;
	/** The panel's smaller field. */
	compact?: boolean;
	autofocus?: boolean;
	onKeyDown?: (event: KeyboardEvent) => void;
}): JSX.Element {
	return (
		<div class="relative min-w-0">
			<span
				class={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-fg-subtle ${props.compact ? "left-2.5" : "left-3"}`}
			>
				<SearchIcon size={props.compact ? "sm" : "lg"} />
			</span>
			<input
				type="search"
				aria-label={props.label}
				placeholder={props.placeholder}
				value={props.value}
				autofocus={props.autofocus}
				ref={(el) => {
					if (props.autofocus) queueMicrotask(() => el.focus());
				}}
				onInput={(event) => props.onInput(event.currentTarget.value)}
				onKeyDown={(event) => props.onKeyDown?.(event)}
				class={`w-full min-w-0 rounded-full bg-fill text-fg outline-none ring-line transition-shadow duration-fast placeholder:text-fg-subtle focus:ring-line-strong [&::-webkit-search-cancel-button]:hidden ${props.compact ? "h-8 pr-2 pl-8 text-body" : "h-10 pr-3 pl-10 text-field md:text-body-lg"}`}
			/>
		</div>
	);
}

/**
 * Ask about the notes from the phone list (Figma Notes — Mobile, Composer dock): a pill with
 * the agent's mark, the question, and send.
 */
export function NoteAskDock(props: {
	label: string;
	placeholder: string;
	value: string;
	onInput: (value: string) => void;
	onSubmit: () => void;
}): JSX.Element {
	return (
		<form
			class="shrink-0 px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
			onSubmit={(event) => {
				event.preventDefault();
				if (props.value.trim()) props.onSubmit();
			}}
		>
			<div class="surface-outline flex h-13 items-center gap-1 rounded-full p-1.5 pl-4">
				<AgentLogo id="claude" name="Claude Code" class="size-4" />
				<input
					aria-label={props.label}
					value={props.value}
					placeholder={props.placeholder}
					onInput={(event) => props.onInput(event.currentTarget.value)}
					enterkeyhint="send"
					class="h-full min-w-0 flex-1 bg-transparent px-2 text-field text-fg outline-none placeholder:text-fg-subtle"
				/>
				<button
					type="submit"
					aria-label="Ask"
					disabled={!props.value.trim()}
					class="focus-ring grid size-10 shrink-0 place-items-center rounded-full bg-inverse text-inverse-fg surface-primary transition-[background-color,color] duration-fast disabled:bg-fill-strong disabled:bg-none disabled:text-fg-faint disabled:shadow-none [&_svg]:size-4"
				>
					<SendIcon />
				</button>
			</div>
		</form>
	);
}

/* ---------------------------------- The document ---------------------------------------- */

/** The document's column: 680px, centred, with the Figma note's spacing between blocks. */
export function NoteColumn(props: { children: JSX.Element }): JSX.Element {
	return (
		<div class="mx-auto flex w-full max-w-170 flex-col gap-4 px-4 pt-2 pb-8 md:px-8 md:pt-10 md:pb-16 lg:px-0">
			{props.children}
		</div>
	);
}

/** The note's title as you read and edit it: 24px, borderless. */
export const NOTE_TITLE =
	"w-full min-w-0 bg-transparent p-0 font-medium text-fg text-headline outline-none placeholder:text-fg-faint";

/**
 * Under the title: who last changed it and when, then whether agents get it (Figma Meta), then
 * where it came from.
 */
export function NoteMeta(props: {
	who: string | null;
	when: JSX.Element;
	/** "Context for Claude Code in grid": shown when the note is shared with agents. */
	context?: string | null;
	/** The agents it goes to, by their logos beside the words. */
	contextAgents?: readonly NoteAgent[];
	source?: JSX.Element;
}): JSX.Element {
	return (
		<div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-caption text-fg-subtle">
			<span class="hidden items-center gap-2 md:flex">
				<Show when={props.who}>{(who) => <Avatar name={who()} size="sm" />}</Show>
				<span>
					<Show when={props.who}>{(who) => <>{who()} · </>}</Show>
					{props.when}
				</span>
			</span>
			<Show when={props.context}>
				{(context) => (
					<>
						<span aria-hidden="true" class="hidden md:inline">
							·
						</span>
						<span class="flex min-w-0 items-center gap-1 md:text-fg-muted">
							<AgentLogos agents={props.contextAgents ?? []} size="size-3" />
							<span class="truncate">{context()}</span>
						</span>
					</>
				)}
			</Show>
			<Show when={props.source}>
				<span aria-hidden="true" class="hidden md:inline">
					·
				</span>
				<span class="min-w-0 truncate">{props.source}</span>
			</Show>
		</div>
	);
}

/** The desktop format bar (Figma Format bar): a pill of formatting buttons, then Ask. */
export function FormatBar(props: { label: string; children: JSX.Element }): JSX.Element {
	return (
		<div
			role="toolbar"
			aria-label={props.label}
			class="surface-outline flex w-fit max-w-full items-center gap-0.5 overflow-x-auto rounded-full px-1.5 py-1 [scrollbar-width:none]"
		>
			{props.children}
		</div>
	);
}

/** The phone's format bar at the foot of the note: icon buttons, then Ask on the right. */
export function FormatFootBar(props: { label: string; children: JSX.Element }): JSX.Element {
	return (
		<div
			role="toolbar"
			aria-label={props.label}
			class="flex shrink-0 items-center gap-0.5 border-line border-t bg-surface px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
		>
			{props.children}
		</div>
	);
}

/** One button on a format bar: 28px on desktop, 36px on the phone's bar. */
export const FORMAT_BUTTON =
	"focus-ring grid size-7 shrink-0 place-items-center rounded-full font-medium text-body text-fg-muted transition-colors duration-fast hover:bg-fill hover:text-fg aria-pressed:bg-fill-strong aria-pressed:text-fg disabled:opacity-40 pointer-coarse:size-9 [&_svg]:size-4";

/** The text style picker at the start of the bar: "Text ▾". */
export const FORMAT_STYLE =
	"focus-ring inline-flex h-6 shrink-0 items-center gap-0.5 rounded-full px-2 font-medium text-caption text-fg-muted transition-colors duration-fast hover:bg-fill hover:text-fg aria-expanded:bg-fill-strong";

/** A hairline between groups on the format bar. */
export function FormatSeparator(): JSX.Element {
	return <span aria-hidden="true" class="mx-0.5 h-4 w-px shrink-0 bg-line" />;
}

/** Ask an agent about the note: quiet on the desktop bar, ink-filled on the phone's. */
export function FormatAsk(props: {
	onClick: () => void;
	label?: string;
	filled?: boolean;
}): JSX.Element {
	return (
		<button
			type="button"
			aria-label={props.label}
			onClick={() => props.onClick()}
			class={`focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-full font-medium transition-colors duration-fast ${props.filled ? "ml-auto h-9 bg-inverse px-3 text-body text-inverse-fg surface-primary" : "h-6 py-1 pr-3 pl-2 text-caption text-fg hover:bg-fill"}`}
		>
			<AgentLogo id="claude" name="Claude Code" class={props.filled ? "size-3.5" : "size-3.5"} />
			Ask
		</button>
	);
}

/** An agent a note can go to: its provider id and name. */
export type NoteAgent = { id: string; name: string };

/** A few agents' logos, overlapping: the ones a note goes to. */
function AgentLogos(props: { agents: readonly NoteAgent[]; size: string }): JSX.Element {
	return (
		<span class="flex -space-x-1">
			<For each={props.agents.slice(0, 3)}>
				{(agent) => <AgentLogo id={agent.id} name={agent.name} class={props.size} />}
			</For>
		</span>
	);
}

/** The top bar's chip (Figma Context chip) as a menu's trigger: who gets the note, and how. */
export const SHARED_CHIP =
	"focus-ring inline-flex h-kit-control-sm shrink-0 items-center gap-1.5 rounded-full bg-fill pr-3 pl-2 font-medium text-caption text-fg-muted transition-colors duration-fast hover:bg-fill-strong hover:text-fg aria-expanded:bg-fill-strong";

/**
 * What the chip says: the logos of the agents the note goes to and "Shared with agents", or
 * faded logos and "Share with agents" while it is the team's alone.
 */
export function SharedChipFace(props: {
	shared: boolean;
	agents: readonly NoteAgent[];
}): JSX.Element {
	return (
		<>
			<span class={props.shared ? "" : "opacity-50 grayscale"}>
				<AgentLogos agents={props.agents} size="size-3.5" />
			</span>
			<span class={props.shared ? "text-fg" : ""}>
				{props.shared ? "Shared with agents" : "Share with agents"}
			</span>
		</>
	);
}

/**
 * An agent's suggested addition to the note (Figma Agent suggestion): who suggests it, the words,
 * and Dismiss or Add to note.
 */
export function NoteSuggestionCard(props: {
	agent: NoteAgent;
	text: string;
	busy?: boolean;
	onDismiss: () => void;
	onAdd: () => void;
}): JSX.Element {
	return (
		<section
			aria-label={`${props.agent.name} suggests an addition`}
			class="flex gap-3 rounded-kit-xl bg-accent/10 p-4"
		>
			<span class="grid size-7 shrink-0 place-items-center rounded-kit-md bg-surface">
				<AgentLogo id={props.agent.id} name={props.agent.name} class="size-4" />
			</span>
			<div class="flex min-w-0 flex-1 flex-col gap-2">
				<p class="font-medium text-body text-fg">{props.agent.name} suggests an addition</p>
				<p class="whitespace-pre-wrap text-body text-fg-muted">{props.text}</p>
				<div class="flex items-center gap-2">
					<button
						type="button"
						disabled={props.busy}
						onClick={() => props.onDismiss()}
						class="focus-ring inline-flex h-kit-control-sm items-center rounded-full px-3 text-caption text-fg-muted transition-colors duration-fast hover:bg-fill hover:text-fg disabled:opacity-40"
					>
						Dismiss
					</button>
					<button
						type="button"
						disabled={props.busy}
						onClick={() => {
							tap();
							props.onAdd();
						}}
						class="focus-ring inline-flex h-kit-control-sm items-center gap-1.5 rounded-full bg-inverse px-3 font-medium text-caption text-inverse-fg transition-opacity duration-fast hover:opacity-90 disabled:opacity-40 [&_svg]:size-3.5"
					>
						<CheckIcon />
						Add to note
					</button>
				</div>
			</div>
		</section>
	);
}

/** The body as you write it: Markdown in a field that grows with it, in the note's own type. */
export const NOTE_FIELD =
	"block w-full min-w-0 resize-none overflow-hidden bg-transparent p-0 font-sans text-body-lg text-fg leading-5 outline-none placeholder:text-fg-faint";

/** A thread the note links to (Figma Linked threads): its state as a dot, its title, a word. */
export function ThreadChip(props: {
	href: string;
	title: string;
	/** Working: the dot pulses in the accent. */
	working?: boolean;
	status?: string;
}): JSX.Element {
	return (
		<a
			href={props.href}
			class="focus-ring inline-flex h-8.5 min-w-0 max-w-full items-center gap-2 rounded-full bg-surface py-1.5 pr-3 pl-2 ring-line transition-colors duration-fast hover:bg-fill max-md:h-7.5 max-md:gap-1.5 max-md:bg-fill"
		>
			<span
				aria-hidden="true"
				class={`hidden size-2 shrink-0 rounded-full md:block ${props.working ? "animate-pulse bg-warning motion-reduce:animate-none" : "bg-fg-faint"}`}
			/>
			<ChatIcon size="sm" class="text-fg-muted md:hidden" />
			<span class="min-w-0 truncate font-medium text-body text-fg max-md:text-caption">
				{props.title}
			</span>
			<Show when={props.status}>
				<span class="hidden shrink-0 text-caption text-fg-subtle md:inline">{props.status}</span>
			</Show>
		</a>
	);
}

/* ------------------------------ The note's text, as blocks ------------------------------- */

/** Words within a block. */
export type NoteInline =
	| { kind: "text"; text: string }
	| { kind: "strong" | "em" | "del"; children: NoteInline[] }
	| { kind: "code"; text: string }
	/** A file the note names, in backticks: `src/jobs/eta.ts` or `@eta.ts`. */
	| { kind: "file"; path: string; line: number | null }
	| { kind: "link"; href: string; children: NoteInline[] }
	/** An image kept with the note (its own upload, never a remote one). */
	| { kind: "image"; src: string; alt: string }
	| { kind: "break" };

export type NoteListItem = {
	/** A task's state, or null for a plain item. */
	task: boolean | null;
	/** Where its box is in the note's text, for ticking it there; -1 when it cannot be found. */
	taskAt: number;
	content: NoteInline[];
	children: NoteBlock[];
};

export type NoteBlock =
	| { kind: "heading"; level: number; content: NoteInline[] }
	| { kind: "paragraph"; content: NoteInline[] }
	| { kind: "list"; ordered: boolean; start: number; items: NoteListItem[] }
	| { kind: "code"; language: string; text: string }
	| { kind: "quote"; blocks: NoteBlock[] }
	| { kind: "table"; header: NoteInline[][]; rows: NoteInline[][][] }
	| { kind: "rule" };

type BlockContext = {
	/** Tick or untick a task (by where its box is); without it tasks are shown, not changed. */
	onTask?: (at: number, done: boolean) => void;
	/** Where a file the note names opens. */
	fileHref: (path: string, line: number | null) => string;
	/** Code as highlighted lines (HTML from the highlighter), or null to show it plain. */
	highlight?: (text: string, language: string) => string[] | null;
};

/** A file the note names, as a chip with its icon (Figma Mention). */
export function FileMention(props: { href: string; path: string }): JSX.Element {
	const name = () => props.path.split("/").pop() ?? props.path;
	return (
		<a
			href={props.href}
			title={props.path}
			class="focus-ring inline-flex h-6.5 max-w-full items-center gap-1 whitespace-nowrap rounded-kit-sm bg-fill py-0.5 pr-1.5 pl-1 align-middle font-medium text-body text-fg ring-line transition-colors duration-fast hover:bg-fill-strong [&_img]:size-3.5 [&_svg]:size-3.5"
		>
			<EntryIcon name={name()} folder={false} />
			<span class="truncate">{name()}</span>
		</a>
	);
}

function Words(props: { content: NoteInline[]; context: BlockContext }): JSX.Element {
	return (
		<For each={props.content}>
			{(part) => (
				<Switch>
					<Match when={part.kind === "text" && part}>{(text) => <>{text().text}</>}</Match>
					<Match when={part.kind === "strong" && part}>
						{(strong) => (
							<strong class="font-semibold text-fg">
								<Words content={strong().children} context={props.context} />
							</strong>
						)}
					</Match>
					<Match when={part.kind === "em" && part}>
						{(em) => (
							<em>
								<Words content={em().children} context={props.context} />
							</em>
						)}
					</Match>
					<Match when={part.kind === "del" && part}>
						{(del) => (
							<del class="text-fg-subtle">
								<Words content={del().children} context={props.context} />
							</del>
						)}
					</Match>
					<Match when={part.kind === "code" && part}>
						{(code) => (
							<code class="rounded-kit-xs bg-fill px-1 py-0.5 font-mono text-body text-fg">
								{code().text}
							</code>
						)}
					</Match>
					<Match when={part.kind === "file" && part}>
						{(file) => (
							<FileMention
								href={props.context.fileHref(file().path, file().line)}
								path={file().path}
							/>
						)}
					</Match>
					<Match when={part.kind === "link" && part}>
						{(link) => (
							<a
								href={link().href}
								target="_blank"
								rel="noopener noreferrer"
								class="focus-ring rounded-kit-xs text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
							>
								<Words content={link().children} context={props.context} />
							</a>
						)}
					</Match>
					<Match when={part.kind === "image" && part}>
						{(image) => (
							<img
								src={image().src}
								alt={image().alt}
								loading="lazy"
								class="my-2 block max-h-96 max-w-full rounded-kit-lg border border-line"
							/>
						)}
					</Match>
					<Match when={part.kind === "break"}>
						<br />
					</Match>
				</Switch>
			)}
		</For>
	);
}

/** Plain words of a task's line, for its checkbox's name. */
function plainWords(content: NoteInline[]): string {
	return content
		.map((part) =>
			part.kind === "text" || part.kind === "code"
				? part.text
				: part.kind === "file"
					? part.path
					: part.kind === "break"
						? " "
						: part.kind === "image"
							? part.alt
							: plainWords(part.children),
		)
		.join("");
}

function Task(props: { item: NoteListItem; context: BlockContext }): JSX.Element {
	const done = () => props.item.task === true;
	return (
		<li class="flex flex-col gap-2">
			<label class="flex min-w-0 items-start gap-2 text-body-lg">
				<span class="relative mt-0.5 inline-grid size-4 shrink-0 place-items-center">
					<input
						type="checkbox"
						checked={done()}
						disabled={!props.context.onTask || props.item.taskAt < 0}
						aria-label={plainWords(props.item.content) || "Task"}
						onChange={(event) => {
							tap();
							props.context.onTask?.(props.item.taskAt, event.currentTarget.checked);
						}}
						class="peer focus-ring size-4 cursor-pointer appearance-none rounded-kit-xs bg-surface ring-line-strong transition-colors duration-fast checked:bg-accent checked:shadow-none disabled:cursor-default"
					/>
					<svg
						viewBox="0 0 16 16"
						fill="none"
						aria-hidden="true"
						class="pointer-events-none absolute size-3 text-white opacity-0 peer-checked:opacity-100"
					>
						<path
							d="M4 8.5l2.5 2.5L12 5.5"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</span>
				<span class={`min-w-0 break-words ${done() ? "text-fg-muted" : "text-fg"}`}>
					<Words content={props.item.content} context={props.context} />
				</span>
			</label>
			<Show when={props.item.children.length}>
				<div class="flex flex-col gap-2 pl-6">
					<Blocks blocks={props.item.children} context={props.context} />
				</div>
			</Show>
		</li>
	);
}

function List(props: {
	block: Extract<NoteBlock, { kind: "list" }>;
	context: BlockContext;
}): JSX.Element {
	const tasks = () => props.block.items.every((item) => item.task !== null);
	return (
		<Show
			when={!tasks()}
			fallback={
				<ul class="flex flex-col gap-2">
					<For each={props.block.items}>
						{(item) => <Task item={item} context={props.context} />}
					</For>
				</ul>
			}
		>
			<Dynamic
				ordered={props.block.ordered}
				start={props.block.start}
				class={`flex flex-col gap-1 pl-5 text-body-lg text-fg ${props.block.ordered ? "list-decimal" : "list-disc"} marker:text-fg-subtle`}
			>
				<For each={props.block.items}>
					{(item) => (
						<Show when={item.task === null} fallback={<Task item={item} context={props.context} />}>
							<li class="break-words pl-1">
								<Words content={item.content} context={props.context} />
								<Show when={item.children.length}>
									<div class="mt-1 flex flex-col gap-1">
										<Blocks blocks={item.children} context={props.context} />
									</div>
								</Show>
							</li>
						</Show>
					)}
				</For>
			</Dynamic>
		</Show>
	);
}

/** An ordered or plain list element, without a dynamic tag. */
function Dynamic(props: {
	ordered: boolean;
	start: number;
	class: string;
	children: JSX.Element;
}): JSX.Element {
	return (
		<Show when={props.ordered} fallback={<ul class={props.class}>{props.children}</ul>}>
			<ol start={props.start} class={props.class}>
				{props.children}
			</ol>
		</Show>
	);
}

/** Code as the Figma note draws it: a soft well, 13px lines, no card chrome. */
function Code(props: {
	block: Extract<NoteBlock, { kind: "code" }>;
	context: BlockContext;
}): JSX.Element {
	const lines = () => props.context.highlight?.(props.block.text, props.block.language) ?? null;
	return (
		<pre
			aria-label={props.block.language ? `${props.block.language} code` : "Code"}
			class="code-lines overflow-x-auto rounded-kit-xl bg-fill px-4 py-3 font-mono text-body text-fg-muted leading-5 ring-line max-md:px-3"
		>
			<Show when={lines()} fallback={<code>{props.block.text}</code>}>
				{(html) => <code innerHTML={html().join("\n")} />}
			</Show>
		</pre>
	);
}

function Blocks(props: { blocks: NoteBlock[]; context: BlockContext }): JSX.Element {
	return (
		<For each={props.blocks}>
			{(block) => (
				<Switch>
					<Match when={block.kind === "heading" && block}>
						{(heading) => (
							<Show
								when={heading().level <= 1}
								fallback={
									<h3 class="pt-1 font-medium text-body-lg text-fg">
										<Words content={heading().content} context={props.context} />
									</h3>
								}
							>
								<h2 class="pt-2 font-medium text-fg text-headline">
									<Words content={heading().content} context={props.context} />
								</h2>
							</Show>
						)}
					</Match>
					<Match when={block.kind === "paragraph" && block}>
						{(paragraph) => (
							<p class="break-words text-body-lg text-fg leading-5">
								<Words content={paragraph().content} context={props.context} />
							</p>
						)}
					</Match>
					<Match when={block.kind === "list" && block}>
						{(list) => <List block={list()} context={props.context} />}
					</Match>
					<Match when={block.kind === "code" && block}>
						{(code) => <Code block={code()} context={props.context} />}
					</Match>
					<Match when={block.kind === "quote" && block}>
						{(quote) => (
							<blockquote class="flex flex-col gap-3 border-line-strong border-l-2 pl-3 text-fg-muted">
								<Blocks blocks={quote().blocks} context={props.context} />
							</blockquote>
						)}
					</Match>
					<Match when={block.kind === "table" && block}>
						{(table) => (
							<div class="overflow-x-auto rounded-kit-lg ring-line">
								<table class="w-full border-collapse text-left text-body">
									<thead class="bg-fill text-fg-muted">
										<tr>
											<For each={table().header}>
												{(cell) => (
													<th class="px-3 py-2 font-medium">
														<Words content={cell} context={props.context} />
													</th>
												)}
											</For>
										</tr>
									</thead>
									<tbody>
										<For each={table().rows}>
											{(row) => (
												<tr class="border-line border-t">
													<For each={row}>
														{(cell) => (
															<td class="px-3 py-2 text-fg">
																<Words content={cell} context={props.context} />
															</td>
														)}
													</For>
												</tr>
											)}
										</For>
									</tbody>
								</table>
							</div>
						)}
					</Match>
					<Match when={block.kind === "rule"}>
						<hr class="border-line" />
					</Match>
				</Switch>
			)}
		</For>
	);
}

/**
 * A note's text as the document view draws it (Figma 14 · Notes, Document): paragraphs, headings
 * as the note's section titles, checklists you tick, files as chips, code in a soft well.
 */
export function NoteBlocks(props: BlockContext & { blocks: NoteBlock[] }): JSX.Element {
	return (
		<Blocks
			blocks={props.blocks}
			context={{
				get onTask() {
					return props.onTask;
				},
				fileHref: (path, line) => props.fileHref(path, line),
				highlight: (text, language) => props.highlight?.(text, language) ?? null,
			}}
		/>
	);
}

/** A file in the "@" picker: its name, and its folder under it. */
export function FileChoice(props: { path: string; onPick: () => void }): JSX.Element {
	const name = () => props.path.split("/").pop() ?? props.path;
	return (
		<button
			type="button"
			onClick={() => props.onPick()}
			class="focus-ring flex min-w-0 items-center gap-2 rounded-kit-md px-2 py-1.5 text-left transition-colors duration-fast hover:bg-fill [&_img]:size-4"
		>
			<EntryIcon name={name()} folder={false} />
			<span class="flex min-w-0 flex-col">
				<span class="truncate text-body text-fg">{name()}</span>
				<span class="truncate text-caption text-fg-subtle">{props.path}</span>
			</span>
		</button>
	);
}

/**
 * The keyboard's way into writing: out of sight until it has focus, then a small pill before
 * the note's words (a pointer opens them with a press on the words).
 */
export function EditTextButton(props: { onClick: () => void }): JSX.Element {
	return (
		<button
			type="button"
			onClick={() => props.onClick()}
			class="focus-ring sr-only w-fit rounded-full bg-fill px-3 py-1 text-caption text-fg-muted ring-line focus:not-sr-only"
		>
			Edit the text
		</button>
	);
}

/** A caption over the note's links (Figma Linked threads). */
export function NoteCaption(props: { children: JSX.Element }): JSX.Element {
	return <h3 class="font-medium text-caption text-fg-subtle max-md:text-body">{props.children}</h3>;
}
