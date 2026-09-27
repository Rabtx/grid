import type { JSX } from "@solidjs/web";
import { createMemo, createSignal, For, onSettled, Show } from "solid-js";

import { attachContextMenu, type MenuPoint } from "./context-menu";
import { CloseIcon, FileIcon } from "./icons";

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

/** A message's actions under it (copy, note, regenerate): shown on hover, never drawn on touch. */
function ActionBar(props: { children: JSX.Element; align: "start" | "end" }): JSX.Element {
	return (
		<div
			class={`flex h-7 items-center gap-0.5 px-1 pt-1 opacity-0 transition-opacity duration-fast group-hover/message:opacity-100 group-focus-within/message:opacity-100 pointer-coarse:hidden ${props.align === "end" ? "justify-end" : ""}`}
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
		<div ref={ref} class="group/message flex flex-col gap-1.5">
			{props.attachmentContent}
			<Show when={props.attachments?.length}>
				<div class="flex flex-wrap gap-1.5">
					<For each={props.attachments}>{(name) => <Attachment name={name} />}</For>
				</div>
			</Show>
			<div class="surface-well px-4 py-3 text-body-lg text-fg">
				<div
					class={`whitespace-pre-wrap break-words ${props.clamp && !open() ? "line-clamp-4" : ""}`}
				>
					{props.children}
				</div>
			</div>
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

/** A file attached to a message. */
export function Attachment(props: {
	name: string;
	size?: number;
	preview?: string;
	href?: string;
	onOpen?: () => void;
	onRemove?: () => void;
	disabled?: boolean;
}): JSX.Element {
	const content = () => (
		<>
			<Show when={props.preview} fallback={<FileIcon size="sm" />}>
				<img
					src={props.preview}
					alt={props.name}
					class="size-16 shrink-0 rounded-kit-sm object-cover object-top"
				/>
			</Show>
			<span class="min-w-0 truncate">
				{props.name}
				<Show when={props.size !== undefined}>
					<span class="ml-1 text-caption text-fg-subtle">
						{Math.ceil((props.size ?? 0) / 1024)} KB
					</span>
				</Show>
			</span>
		</>
	);
	return (
		<span class="inline-flex min-h-11 max-w-full items-center gap-1 rounded-kit bg-surface px-2 text-body text-fg-muted ring-line-strong md:max-w-72">
			<Show
				when={props.href}
				fallback={
					<Show
						when={props.onOpen}
						fallback={<span class="flex min-w-0 items-center gap-2 py-1">{content()}</span>}
					>
						<button
							type="button"
							onClick={() => props.onOpen?.()}
							disabled={props.disabled}
							class="focus-ring flex min-h-11 min-w-0 items-center gap-2 py-1"
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
					class="focus-ring flex min-h-11 min-w-0 items-center gap-2 py-1"
				>
					{content()}
				</a>
			</Show>
			<Show when={props.onRemove}>
				<button
					type="button"
					aria-label={`Remove ${props.name}`}
					disabled={props.disabled}
					onClick={() => props.onRemove?.()}
					class="focus-ring grid size-11 shrink-0 place-items-center rounded-kit hover:bg-fill disabled:opacity-40"
				>
					<CloseIcon size="sm" />
				</button>
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
	const added = () => props.added ?? props.lines.filter((line) => line.kind === "add").length;
	const removed = () => props.removed ?? props.lines.filter((line) => line.kind === "del").length;
	return (
		<figure class="min-w-0 overflow-hidden rounded-kit-lg ring-line">
			<figcaption class="flex h-9 min-w-0 items-center gap-2 border-line border-b bg-fill px-3 text-caption">
				<FileIcon size="sm" class="text-fg-subtle" />
				<span class="min-w-0 flex-1 truncate font-mono text-fg-muted" title={props.path}>
					{props.path.replace(/^\/home\/[^/]+/, "~")}
				</span>
				<DiffStat added={added()} removed={removed()} />
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
										when={line.kind !== "hunk" && line}
										fallback={
											<tr class="bg-fill text-fg-faint">
												<td colspan={4} class="px-3 py-0.5">
													{props.numbered === false ? "···" : (line as { text: string }).text}
												</td>
											</tr>
										}
									>
										{(code) => {
											const row = code() as Exclude<DiffLine, { kind: "hunk" }>;
											return (
												<tr data-kind={row.kind} class={LINE_TONE[row.kind]}>
													<Show when={props.numbered !== false}>
														<td class="hidden w-px select-none whitespace-nowrap px-1.5 text-right text-fg-faint md:table-cell">
															{row.old ?? ""}
														</td>
														<td class="w-px select-none whitespace-nowrap px-1.5 text-right text-fg-faint">
															{row.new ?? row.old ?? ""}
														</td>
													</Show>
													<td
														class={`w-px select-none pl-2 ${row.kind === "add" ? "text-success" : "text-danger"}`}
													>
														{LINE_MARK[row.kind]}
													</td>
													<Show
														when={row.html}
														fallback={
															<td class="whitespace-pre pr-3 pl-1 text-fg-muted">
																{row.text || " "}
															</td>
														}
													>
														{/* oxlint-disable-next-line jsx-a11y/control-has-associated-label -- a table cell of code, set as highlighted HTML */}
														<td
															class="whitespace-pre pr-3 pl-1 text-fg-muted"
															innerHTML={row.html}
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
