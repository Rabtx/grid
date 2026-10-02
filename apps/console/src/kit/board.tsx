import type { JSX } from "@solidjs/web";
import { For, onSettled, Show } from "solid-js";

import { Avatar, NobodyMark } from "./avatar";
import { attachContextMenu, type MenuPoint } from "./context-menu";
import { Skeleton } from "./surface";

export type TaskStatusKind = "backlog" | "todo" | "doing" | "review" | "done" | "blocked";

const STATUS: Record<TaskStatusKind, { label: string; color: string; fill: number }> = {
	backlog: { label: "Backlog", color: "var(--kit-fg-faint)", fill: 0 },
	todo: { label: "To do", color: "var(--kit-fg-subtle)", fill: 0 },
	doing: { label: "In progress", color: "var(--signal-warning)", fill: 0.5 },
	review: { label: "In review", color: "var(--signal-accent)", fill: 0.75 },
	done: { label: "Done", color: "var(--signal-success)", fill: 1 },
	blocked: { label: "Blocked", color: "var(--signal-danger)", fill: 0.25 },
};

/** The name of each sample stage, for columns built from the kit's own statuses. */
export function taskStatusLabel(status: TaskStatusKind): string {
	return STATUS[status].label;
}

/** A stage as a ring that fills as it moves along; a dashed ring while it waits in backlog. */
export function TaskStatus(props: { status: TaskStatusKind; class?: string }): JSX.Element {
	const look = () => STATUS[props.status];
	return (
		<svg viewBox="0 0 16 16" class={props.class ?? "size-4"}>
			<title>{look().label}</title>
			<circle
				cx="8"
				cy="8"
				r="6"
				fill="none"
				stroke={look().color}
				stroke-width="1.5"
				stroke-dasharray={props.status === "backlog" ? "2 2" : undefined}
			/>
			<Show when={look().fill > 0}>
				<circle
					cx="8"
					cy="8"
					r="3"
					fill="none"
					stroke={look().color}
					stroke-width="6"
					stroke-dasharray={`${look().fill * 18.85} 18.85`}
					transform="rotate(-90 8 8)"
				/>
			</Show>
		</svg>
	);
}

/**
 * A task on the board: its key and title, who has it, where the work lives. The card is a link
 * (so the task opens at its own URL) that can be a drag source; its actions show on hover for
 * pointers, and right-click or a long press opens the same menu.
 */
export function TaskCard(props: {
	id: string;
	title: string;
	/** Where the card leads; without it the card is a button calling `onClick`. */
	href?: string;
	onClick?: () => void;
	/** The stage as a glyph, for boards grouped some other way. */
	statusIcon?: JSX.Element;
	status?: TaskStatusKind;
	owner?: string | null;
	/** Right of the owner: a branch, a due date. */
	meta?: string;
	labels?: readonly string[];
	agent?: boolean;
	/** Row actions for pointers (a ⋯ menu); touch uses `onMenuAt`. */
	actions?: JSX.Element;
	onMenuAt?: (point: MenuPoint) => void;
	/** Drag and drop, where the pointer can do it. */
	draggable?: boolean;
	dragging?: boolean;
	onDragStart?: (event: DragEvent) => void;
	onDragEnd?: () => void;
	/** Accessible name for the whole card; the key and title by default. */
	label?: string;
	assignee?: string;
	/** The owner's own mark (an agent's logo) in place of the initials. */
	ownerMark?: JSX.Element;
	/** A chip before the labels: the task's finer stage when its column holds several. */
	tag?: JSX.Element;
}): JSX.Element {
	let frame: HTMLDivElement | undefined;
	onSettled(() => {
		const open = props.onMenuAt;
		return frame && open ? attachContextMenu(frame, open) : undefined;
	});
	const owner = () => props.owner ?? props.assignee ?? null;
	const icon = () =>
		props.statusIcon ??
		(props.status ? <TaskStatus status={props.status} class="size-3.5" /> : null);
	const body = () => (
		<article class="flex flex-col gap-2.5 p-3">
			<Show when={props.labels?.length || props.agent || props.tag}>
				<div class="flex flex-wrap gap-1.5">
					<Show when={props.agent}>
						<span class="surface-outline inline-flex h-6 items-center gap-1.5 rounded-full px-2 text-caption text-accent">
							<span class="size-1.5 animate-pulse rounded-full bg-accent motion-reduce:animate-none" />
							Agent working
						</span>
					</Show>
					{props.tag}
					<For each={props.labels}>
						{(label) => (
							<span class="surface-outline inline-flex h-6 items-center gap-1.5 rounded-full px-2 text-caption text-fg-muted">
								<span class="size-1.5 rounded-full bg-fg-faint" />
								{label}
							</span>
						)}
					</For>
				</div>
			</Show>
			<p class="line-clamp-3 break-words font-medium text-body text-fg leading-snug">
				{props.title}
			</p>
			<div class="flex min-w-0 items-center gap-2 text-caption text-fg-subtle">
				{icon()}
				<Show
					when={props.ownerMark}
					fallback={
						<Show when={owner()} fallback={<NobodyMark size="xs" />}>
							{(name) => <Avatar name={name()} size="xs" />}
						</Show>
					}
				>
					{props.ownerMark}
				</Show>
				<span class="shrink-0 font-mono">{props.id}</span>
				<Show when={props.meta}>
					<span class="ml-auto min-w-0 truncate font-mono" title={props.meta}>
						{props.meta}
					</span>
				</Show>
			</div>
		</article>
	);
	const SURFACE =
		"surface-card focus-ring block w-full rounded-kit-xl text-left transition-[box-shadow,transform] duration-fast hover:shadow-lift-hover active:scale-[0.98]";
	return (
		<div
			ref={(el) => {
				frame = el;
			}}
			class={`group/card relative select-none [-webkit-touch-callout:none] ${props.dragging ? "opacity-50" : ""}`}
		>
			<Show
				when={props.href}
				fallback={
					<button
						type="button"
						onClick={() => props.onClick?.()}
						class={SURFACE}
						aria-label={props.label}
					>
						{body()}
					</button>
				}
			>
				<a
					href={props.href}
					aria-label={props.label ?? `${props.id} ${props.title}`}
					draggable={props.draggable ? "true" : undefined}
					onDragStart={(event) => props.onDragStart?.(event)}
					onDragEnd={() => props.onDragEnd?.()}
					class={`${SURFACE} ${props.draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
				>
					{body()}
				</a>
			</Show>
			<Show when={props.actions}>
				<div class="absolute top-2 right-2 opacity-0 transition-opacity duration-fast group-hover/card:opacity-100 focus-within:opacity-100 pointer-coarse:pointer-events-none pointer-coarse:opacity-0">
					{props.actions}
				</div>
			</Show>
		</div>
	);
}

/**
 * A board column: its icon, title, count and an action, then its cards. It can be a drop
 * target (the caller wires the drag events) and lights up while something hovers over it. On
 * phones the header hides when the stage is named in tabs above instead.
 */
export function BoardColumn(props: {
	title: string;
	icon?: JSX.Element;
	count: number;
	action?: JSX.Element;
	/** Something is being dragged over it. */
	highlight?: boolean;
	/** Hide the header on phones (the stage tabs name it). */
	headerFromMd?: boolean;
	/** Content before the cards: an inline add. */
	top?: JSX.Element;
	/** Content after the cards: "Add a task", "Show 2 more". */
	bottom?: JSX.Element;
	id?: string;
	onDragOver?: (event: DragEvent) => void;
	onDragLeave?: (event: DragEvent) => void;
	onDrop?: (event: DragEvent) => void;
	children: JSX.Element;
}): JSX.Element {
	return (
		<section
			id={props.id}
			data-lane={props.id?.replace(/^lane-/, "")}
			aria-label={props.title}
			class="flex min-h-0 w-full shrink-0 snap-start flex-col md:w-auto md:min-w-64 md:flex-1 md:basis-0"
		>
			<div
				onDragOver={(event) => props.onDragOver?.(event)}
				onDragLeave={(event) => props.onDragLeave?.(event)}
				onDrop={(event) => props.onDrop?.(event)}
				class={`flex min-h-0 flex-1 flex-col gap-2 rounded-kit-2xl transition-colors duration-fast md:p-2 ${props.highlight ? "bg-fill-strong" : "md:bg-surface-sunken"}`}
			>
				<header
					class={`h-8 items-center gap-2 px-1.5 ${props.headerFromMd ? "hidden md:flex" : "flex"}`}
				>
					{props.icon}
					<h2 class="font-medium text-body text-fg">{props.title}</h2>
					<span data-count class="text-caption text-fg-subtle tabular-nums">
						{String(props.count)}
					</span>
					<span class="flex-1" />
					{props.action}
				</header>
				{props.top}
				<div class="-mx-2 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-2 pb-1">
					{props.children}
					{props.bottom}
				</div>
			</div>
		</section>
	);
}

/**
 * The board's columns side by side, scrolling sideways: one column at a time with snapping on
 * phones, free scrolling from md.
 */
export function LaneStrip(props: {
	children: JSX.Element;
	ref?: (el: HTMLDivElement) => void;
}): JSX.Element {
	return (
		<div
			ref={(el) => props.ref?.(el)}
			class="-mx-4 flex min-h-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-4 [scrollbar-width:none] motion-safe:scroll-smooth md:-mx-6 md:snap-none md:scroll-px-6 md:px-6 md:[scrollbar-width:thin]"
		>
			{props.children}
		</div>
	);
}

/** Columns in outline while the board loads: one on phones, four from md. */
export function BoardSkeleton(): JSX.Element {
	return (
		<div class="flex gap-3" aria-hidden="true">
			<For each={[0, 1, 2, 3]}>
				{(index) => (
					<div
						class={`w-full shrink-0 flex-col gap-2 rounded-kit-xl bg-surface-sunken p-2 md:w-72 ${index === 0 ? "flex" : "hidden md:flex"}`}
					>
						<Skeleton class="mx-1.5 my-2 h-4 w-24" />
						<Skeleton class="h-24" />
						<Skeleton class="h-16" />
					</div>
				)}
			</For>
		</div>
	);
}

/** The tone of a board column's dot: waiting, moving, in review, finished. */
export type LaneTone = "todo" | "doing" | "review" | "done";

const LANE_DOT: Record<LaneTone, string> = {
	todo: "bg-fg-faint",
	doing: "bg-accent",
	review: "bg-violet",
	done: "bg-success",
};

/** A board column's coloured dot, before its name (Figma 12 · Board). */
export function LaneDot(props: { tone: LaneTone }): JSX.Element {
	return <span aria-hidden="true" class={`size-2 shrink-0 rounded-full ${LANE_DOT[props.tone]}`} />;
}

/** A small outlined chip on a card: a finer stage ("Blocked", "QA") or a label. */
export function CardChip(props: {
	children: JSX.Element;
	tone?: "danger" | "accent";
}): JSX.Element {
	return (
		<span
			class={`surface-outline inline-flex h-6 items-center gap-1.5 rounded-full px-2 text-caption ${props.tone === "danger" ? "text-danger" : props.tone === "accent" ? "text-accent" : "text-fg-muted"}`}
		>
			<span
				class={`size-1.5 rounded-full ${props.tone === "danger" ? "bg-danger" : props.tone === "accent" ? "bg-accent" : "bg-fg-faint"}`}
			/>
			{props.children}
		</span>
	);
}

/** A finished task in the Done column: a tick, its title, and who did it. One line. */
export function DoneRow(props: {
	title: string;
	href: string;
	owner?: JSX.Element;
	label?: string;
}): JSX.Element {
	return (
		<a
			href={props.href}
			aria-label={props.label ?? props.title}
			class="surface-card focus-ring flex h-11 min-w-0 items-center gap-2.5 rounded-kit-xl px-3 text-body text-fg transition-shadow duration-fast hover:shadow-lift-hover"
		>
			<span class="shrink-0 text-success [&_svg]:size-3.5">
				<svg
					viewBox="0 0 16 16"
					fill="none"
					stroke="currentColor"
					stroke-width="1.8"
					aria-hidden="true"
				>
					<path d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke-linecap="round" stroke-linejoin="round" />
				</svg>
			</span>
			<span class="min-w-0 flex-1 truncate">{props.title}</span>
			{props.owner}
		</a>
	);
}

/**
 * The strip across the top of the board (Figma 12 · Board): a few tiles side by side, each a mark,
 * a line in ink and a quieter line under it. Stacked in a scroller on phones.
 */
export function BoardStats(props: { children: JSX.Element }): JSX.Element {
	return (
		<div class="surface-card mb-3 grid shrink-0 grid-cols-2 overflow-hidden rounded-kit-2xl md:grid-cols-4 [&>*]:border-line [&>*+*]:border-l max-md:[&>*:nth-child(3)]:border-l-0 max-md:[&>*:nth-child(n+3)]:border-t">
			{props.children}
		</div>
	);
}

export function BoardStat(props: {
	mark: JSX.Element;
	title: string;
	detail?: string;
	href?: string;
}): JSX.Element {
	const body = () => (
		<>
			<span class="flex h-8 min-w-8 shrink-0 items-center justify-center">{props.mark}</span>
			<span class="flex min-w-0 flex-col">
				<span class="truncate text-body text-fg">{props.title}</span>
				<Show when={props.detail}>
					<span class="truncate text-caption text-fg-subtle">{props.detail}</span>
				</Show>
			</span>
		</>
	);
	const frame = "flex min-w-0 items-center gap-3 px-4 py-3.5";
	return (
		<Show when={props.href} fallback={<div class={frame}>{body()}</div>}>
			<a
				href={props.href}
				class={`focus-ring ${frame} transition-colors duration-fast hover:bg-fill`}
			>
				{body()}
			</a>
		</Show>
	);
}

/** A row of small bars, one per value: a week of finished work, oldest first. */
export function MiniBars(props: { values: readonly number[]; label: string }): JSX.Element {
	const top = () => Math.max(1, ...props.values);
	return (
		<span class="flex h-6 items-end gap-0.5">
			<span class="sr-only">{props.label}</span>
			<For each={props.values}>
				{(value) => (
					<span
						aria-hidden="true"
						class={`w-1 rounded-full ${value > 0 ? "bg-success" : "bg-fill-strong"}`}
						style={{ height: `${Math.max(15, Math.round((value / top()) * 100))}%` }}
					/>
				)}
			</For>
		</span>
	);
}
