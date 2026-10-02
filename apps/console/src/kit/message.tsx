import type { JSX } from "@solidjs/web";
import { createMemo, createSignal, For, onSettled, Show, untrack } from "solid-js";

import { attachContextMenu, type MenuPoint } from "./context-menu";
import { CloseIcon, FileIcon, RestoreIcon } from "./icons";
import { EntryIcon } from "./file-icon";

/** Wires a long press on touch screens to a message's menu; the hover bar is for pointers. */
function useTouchMenu(open: (() => ((point: MenuPoint) => void) | undefined) | undefined) {
	let row: HTMLDivElement | undefined;
	onSettled(() => {
		const handler = open?.();
		return row && handler ? attachContextMenu(row, handler, { touchOnly: true }) : undefined;
	});
	return (el: HTMLDivElement) => {
		row = el;
	};
}

/**
 * A message's actions under it (copy, note, regenerate): shown on hover. On touch they take no
 * room and cannot be tapped, but stay mounted so a long press can open the message's menu.
 */
function ActionBar(props: { children: JSX.Element; align: "start" | "end" }): JSX.Element {
	return (
		<div
			class={`flex h-7 items-center gap-0.5 px-1 pt-1 opacity-0 transition-opacity duration-fast group-hover/message:opacity-100 group-focus-within/message:opacity-100 pointer-coarse:pointer-events-none pointer-coarse:absolute pointer-coarse:size-0 pointer-coarse:overflow-hidden pointer-coarse:p-0 pointer-coarse:opacity-0 ${props.align === "end" ? "justify-end" : ""}`}
		>
			{props.children}
		</div>
	);
}

/**
 * What you asked, opening the turn: a soft card across the column, as wide as the answer under
 * it. Long messages clamp to four lines until opened. Actions show on hover; a long press on touch
 * calls `onMenuAt`.
 */
export function UserMessage(props: {
	children: JSX.Element;
	/** Who sent it and when, under the bubble ("You · 2m ago"). */
	meta?: string;
	attachments?: readonly string[];
	attachmentContent?: JSX.Element;
	/** Clamp to four lines, with the actions offering "Show more". */
	clamp?: boolean;
	actions?: JSX.Element;
	onMenuAt?: (point: MenuPoint) => void;
}): JSX.Element {
	const [open, setOpen] = createSignal(false);
	const ref = useTouchMenu(() => props.onMenuAt);
	return (
		<div ref={ref} class="group/message flex flex-col items-end gap-1.5">
			{props.attachmentContent}
			<Show when={props.attachments?.length}>
				<div class="flex flex-wrap gap-1.5">
					<For each={props.attachments}>{(name) => <Attachment name={name} />}</For>
				</div>
			</Show>
			<div class="max-w-xl rounded-kit-2xl bg-selection px-4 py-2.5 text-body-lg text-fg">
				<div
					class={`whitespace-pre-wrap break-words ${props.clamp && !open() ? "line-clamp-4" : ""}`}
				>
					{props.children}
				</div>
			</div>
			<Show when={props.meta}>
				<span class="px-1 text-caption text-fg-subtle">{props.meta}</span>
			</Show>
			<Show when={props.actions || props.clamp}>
				<ActionBar align="end">
					<Show when={props.clamp}>
						<button
							type="button"
							onClick={() => setOpen(!open())}
							class="focus-ring h-6 rounded-kit-sm px-1.5 text-caption text-fg-subtle hover:bg-fill hover:text-fg"
						>
							{open() ? "Show less" : "Show more"}
						</button>
					</Show>
					{props.actions}
				</ActionBar>
			</Show>
		</div>
	);
}

/** What the agent said: prose on the canvas, no bubble, then its actions on hover. */
export function AgentMessage(props: {
	children: JSX.Element;
	actions?: JSX.Element;
	onMenuAt?: (point: MenuPoint) => void;
}): JSX.Element {
	const ref = useTouchMenu(() => props.onMenuAt);
	return (
		<div ref={ref} class="group/message flex min-w-0 flex-col items-start">
			<div class="min-w-0 max-w-full text-body-lg text-fg">{props.children}</div>
			<Show when={props.actions}>
				<ActionBar align="start">{props.actions}</ActionBar>
			</Show>
		</div>
	);
}

/**
 * Markdown rendered to HTML (by the caller, sanitised) in the reading style: comfortable lines,
 * code and tables in the kit's shapes. The styles live in global.css under `.chat-prose`.
 */
export function Prose(props: {
	html: string;
	/** Drawn in an outlined box, as a preview beside the field it renders. */
	framed?: boolean;
	/** Clicks inside, for delegating the code cards' own buttons (copy). */
	onClick?: (event: MouseEvent) => void;
}): JSX.Element {
	return (
		// oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- delegates clicks from the buttons inside the rendered HTML
		<div
			class={`chat-prose min-w-0 max-w-full break-words ${props.framed ? "min-h-24 overflow-x-auto rounded-kit-md px-3 py-2 ring-line" : "px-1"}`}
			innerHTML={props.html}
			onClick={(event) => props.onClick?.(event)}
		/>
	);
}

export function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** A file attached to a message. */
export function Attachment(props: {
	name: string;
	size?: number;
	preview?: string;
	href?: string;
	progress?: number;
	error?: string | null;
	onRetry?: () => void;
	reference?: boolean;
	onOpen?: () => void;
	onRemove?: () => void;
	disabled?: boolean;
}): JSX.Element {
	// A project file is named by its path: the name on top, its folder under it.
	const shownName = () =>
		props.reference ? (props.name.split("/").pop() ?? props.name) : props.name;
	const folder = () => {
		if (!props.reference) return "";
		const parts = props.name.split("/");
		parts.pop();
		return parts.join("/");
	};
	const second = () =>
		props.error
			? null
			: props.progress !== undefined && props.progress < 100
				? `${props.progress}%`
				: props.reference
					? folder() || "Project file"
					: props.size !== undefined
						? formatFileSize(props.size)
						: null;
	const content = () => (
		<>
			<Show
				when={props.preview && !props.reference}
				fallback={
					<span class="grid size-9 shrink-0 place-items-center rounded-kit-md tint-accent">
						<EntryIcon name={shownName()} folder={false} />
					</span>
				}
			>
				<img
					src={props.preview}
					alt={props.name}
					class="size-9 shrink-0 rounded-kit-md object-cover object-top"
				/>
			</Show>
			<span class="flex min-w-0 flex-col">
				<span class="min-w-0 max-w-40 truncate text-fg md:max-w-52" title={props.name}>
					{shownName()}
				</span>
				<Show when={second()}>
					{(line) => (
						<span class="truncate text-caption text-fg-subtle tabular-nums">{line()}</span>
					)}
				</Show>
				<Show when={props.error}>
					<span class="truncate text-caption text-danger" title={props.error ?? undefined}>
						{props.error}
					</span>
				</Show>
			</span>
		</>
	);

	return (
		<span
			class={`relative inline-flex min-h-12 max-w-full items-center gap-1 overflow-hidden rounded-kit-lg py-1.5 pr-1 pl-1.5 text-body md:max-w-80 ${
				props.error ? "bg-danger/8 ring-1 ring-danger/30" : "bg-fill"
			}`}
		>
			<Show
				when={props.href}
				fallback={
					<Show
						when={props.onOpen}
						fallback={<span class="flex min-w-0 items-center gap-2.5 pr-1">{content()}</span>}
					>
						<button
							type="button"
							onClick={() => props.onOpen?.()}
							disabled={props.disabled}
							class="focus-ring flex min-w-0 items-center gap-2.5 rounded-kit-md pr-1 text-left"
						>
							{content()}
						</button>
					</Show>
				}
			>
				<a
					href={props.href}
					target="_blank"
					rel="noopener noreferrer"
					class="focus-ring flex min-w-0 items-center gap-2.5 rounded-kit-md pr-1 text-left"
				>
					{content()}
				</a>
			</Show>
			<Show when={props.error && props.onRetry}>
				<button
					type="button"
					aria-label={`Retry ${props.name}`}
					onClick={() => props.onRetry?.()}
					class="focus-ring flex items-center gap-1 rounded-kit px-1.5 py-1 text-caption text-accent hover:bg-fill pointer-coarse:min-h-11"
				>
					<RestoreIcon size="xs" />
					<span>Retry</span>
				</button>
			</Show>
			<Show when={props.onRemove}>
				<button
					type="button"
					aria-label={`Remove ${props.name}`}
					disabled={props.disabled}
					onClick={() => props.onRemove?.()}
					class="focus-ring grid size-7 shrink-0 place-items-center rounded-full text-fg-subtle hover:bg-fill-strong hover:text-fg disabled:opacity-40 pointer-coarse:size-10"
				>
					<CloseIcon size="sm" />
				</button>
			</Show>
			<Show when={props.progress !== undefined && props.progress < 100 && !props.error}>
				<div class="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden rounded-b-kit bg-fill">
					<div
						class="h-full bg-accent transition-all duration-fast"
						style={{ width: `${Math.max(props.progress ?? 0, 5)}%` }}
					/>
				</div>
			</Show>
		</span>
	);
}

/** Lines added and removed, green and red. */
export function DiffStat(props: { added: number; removed: number }): JSX.Element {
	return (
		<span class="shrink-0 font-mono text-caption tabular-nums">
			<span class="text-success">+{props.added}</span>{" "}
			<span class="text-danger">−{props.removed}</span>
		</span>
	);
}

/**
 * One row of a diff: a hunk header, or a line with its numbers in the old and new file and its
 * text (plain) or highlighted HTML.
 */
export type DiffLine =
	| { kind: "hunk"; text: string }
	| {
			kind: "add" | "del" | "context";
			old?: number | null;
			new?: number | null;
			text?: string;
			html?: string;
	  };

const LINE_TONE = { add: "bg-success/10", del: "bg-danger/10", context: "" } as const;
const LINE_MARK = { add: "+", del: "−", context: "" } as const;

/**
 * A change to one file: its path and counts, then its lines — numbered, highlighted, additions in
 * green. Long diffs open at `limit` rows with the rest one tap away.
 */
export function DiffCard(props: {
	path: string;
	lines: readonly DiffLine[];
	added?: number;
	removed?: number;
	/** Show old and new line numbers (off for snippets). */
	numbered?: boolean;
	limit?: number;
}): JSX.Element {
	const [all, setAll] = createSignal(false);
	const limit = () => props.limit ?? 80;
	const shown = createMemo(() => (all() ? props.lines : props.lines.slice(0, limit())));
	/**
	 * Whether the rows carry their line numbers, taken once here: `<Show>` reads its condition
	 * outside a tracking scope, so reading the prop inside the row loop warns in development. The
	 * callers pass a constant either way, so nothing that changes re-renders.
	 */
	const showNumbers = untrack(() => props.numbered !== false);
	const added = () => props.added ?? props.lines.filter((line) => line.kind === "add").length;
	const removed = () => props.removed ?? props.lines.filter((line) => line.kind === "del").length;
	return (
		<figure class="min-w-0 overflow-hidden rounded-kit-lg ring-line-strong">
			<figcaption class="flex h-11 min-w-0 items-center gap-2 border-line border-b bg-surface px-3.5 text-body">
				<FileIcon size="sm" class="text-accent" />
				<span class="min-w-0 truncate font-medium text-fg" title={props.path}>
					{props.path.replace(/^\/home\/[^/]+/, "~")}
				</span>
				<DiffStat added={added()} removed={removed()} />
				<span class="flex-1" />
			</figcaption>
			<Show
				when={props.lines.length > 0}
				fallback={<p class="px-3 py-2 text-caption text-fg-subtle">Too large to show here.</p>}
			>
				<div class="overflow-x-auto">
					<table class="w-full border-collapse font-mono text-caption leading-5">
						<tbody>
							<For each={shown()}>
								{(line) => (
									<Show
										when={line.kind !== "hunk" ? line : null}
										keyed
										fallback={
											<tr class="bg-fill text-fg-faint">
												<td colspan={4} class="px-3 py-0.5">
													{showNumbers ? (line as { text: string }).text : "···"}
												</td>
											</tr>
										}
									>
										{(row) => {
											const code = row as Exclude<DiffLine, { kind: "hunk" }>;
											return (
												<tr data-kind={code.kind} class={LINE_TONE[code.kind]}>
													<Show when={showNumbers}>
														<td class="hidden w-px select-none whitespace-nowrap px-1.5 text-right text-fg-faint md:table-cell">
															{code.old ?? ""}
														</td>
														<td class="w-px select-none whitespace-nowrap px-1.5 text-right text-fg-faint">
															{code.new ?? code.old ?? ""}
														</td>
													</Show>
													<td
														class={`w-px select-none pl-2 ${code.kind === "add" ? "text-success" : "text-danger"}`}
													>
														{LINE_MARK[code.kind]}
													</td>
													<Show
														when={code.html}
														fallback={
															<td class="whitespace-pre pr-3 pl-1 text-fg-muted">
																{code.text || " "}
															</td>
														}
													>
														{/* oxlint-disable-next-line jsx-a11y/control-has-associated-label -- a table cell of code, set as highlighted HTML */}
														<td
															class="whitespace-pre pr-3 pl-1 text-fg-muted"
															innerHTML={code.html}
														/>
													</Show>
												</tr>
											);
										}}
									</Show>
								)}
							</For>
						</tbody>
					</table>
				</div>
				<Show when={!all() && props.lines.length > limit()}>
					<button
						type="button"
						onClick={() => setAll(true)}
						class="focus-ring w-full border-line border-t px-3 py-1.5 text-left text-caption text-link hover:bg-fill pointer-coarse:min-h-10"
					>
						Show all {props.lines.length} lines
					</button>
				</Show>
			</Show>
		</figure>
	);
}

/**
 * Who answered (the Figma thread's agent line): the agent's logo on a small tile, its name, the
 * model in the quiet ink, and when, on the right.
 */
export function AgentHeader(props: {
	logo: JSX.Element;
	name: string;
	model?: string;
	time?: string;
}): JSX.Element {
	return (
		<div class="flex min-w-0 items-center gap-2.5">
			<span class="grid size-7 shrink-0 place-items-center rounded-kit bg-surface ring-line-strong [&>*]:size-4">
				{props.logo}
			</span>
			<span class="min-w-0 truncate font-medium text-body text-fg">{props.name}</span>
			<Show when={props.model}>
				<span class="truncate text-body text-fg-subtle">{props.model}</span>
			</Show>
			<span class="flex-1" />
			<Show when={props.time}>
				<span class="shrink-0 text-caption text-fg-subtle">{props.time}</span>
			</Show>
		</div>
	);
}

/**
 * A thread's title over what it is about (the Figma thread header): a 24px title with a status
 * on its right, then a row of quiet facts, each with its glyph (branch, machine, agent, started).
 */
export function ThreadHeader(props: {
	title: string;
	status?: JSX.Element;
	facts: readonly { icon: JSX.Element; label: string }[];
}): JSX.Element {
	return (
		<header class="flex flex-col gap-2 pb-2">
			<div class="flex items-start gap-3">
				<h1 class="min-w-0 flex-1 font-medium text-fg text-headline">{props.title}</h1>
				<Show when={props.status}>
					<span class="mt-1.5 shrink-0">{props.status}</span>
				</Show>
			</div>
			<ul class="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-fg-muted">
				<For each={props.facts}>
					{(fact) => (
						<li class="flex min-w-0 items-center gap-1.5 [&_svg]:size-3.5 [&_svg]:text-fg-subtle">
							{fact.icon}
							<span class="truncate">{fact.label}</span>
						</li>
					)}
				</For>
			</ul>
		</header>
	);
}

/** A side panel's group (the Figma Run panel): a quiet label, then label–value rows. */
export function FactGroup(props: {
	label: string;
	rows?: readonly { label: string; value: JSX.Element }[];
	children?: JSX.Element;
}): JSX.Element {
	return (
		<section class="flex flex-col gap-2 border-line border-b px-4 py-4 last:border-b-0">
			<h3 class="text-caption text-fg-subtle">{props.label}</h3>
			<Show when={props.rows?.length}>
				<dl class="flex flex-col gap-2">
					<For each={props.rows}>
						{(row) => (
							<div class="flex items-center justify-between gap-3 text-caption">
								<dt class="text-fg-subtle">{row.label}</dt>
								<dd class="min-w-0 truncate text-fg">{row.value}</dd>
							</div>
						)}
					</For>
				</dl>
			</Show>
			{props.children}
		</section>
	);
}
