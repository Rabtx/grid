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
		<article class="flex flex-col gap-2 p-3">
			<div class="flex items-center gap-2 text-caption text-fg-subtle">
				{icon()}
				<span class="font-mono">{props.id}</span>
			</div>
			<p class="line-clamp-3 break-words text-body text-fg leading-snug">{props.title}</p>
			<Show when={props.labels?.length || props.agent}>
				<div class="flex flex-wrap gap-1">
					<Show when={props.agent}>
						<span class="inline-flex h-5 items-center gap-1 rounded-kit-sm bg-accent/10 px-1.5 text-caption text-accent">
							<span class="size-1.5 animate-pulse rounded-full bg-accent" />
							Agent working
						</span>
					</Show>
					<For each={props.labels}>
						{(label) => (
							<span class="inline-flex h-5 items-center rounded-kit-sm px-1.5 text-caption text-fg-subtle ring-line-strong">
								{label}
							</span>
						)}
					</For>
				</div>
			</Show>
			<div class="flex min-w-0 items-center gap-2 text-caption text-fg-subtle">
				<Show
					when={owner()}
					fallback={
						<>
							<NobodyMark size="xs" />
							<span>Unassigned</span>
						</>
					}
				>
					{(name) => (
						<>
							<Avatar name={name()} size="xs" />
							<span class="max-w-[60%] shrink-0 truncate">{name()}</span>
						</>
					)}
				</Show>
				<Show when={props.meta}>
					<span class="ml-auto min-w-0 truncate font-mono" title={props.meta}>
						{props.meta}
					</span>
				</Show>
			</div>
		</article>
	);
	const SURFACE =
		"focus-ring block w-full rounded-kit-lg bg-surface text-left shadow-lift transition-[box-shadow,transform] duration-fast hover:shadow-lift-hover active:scale-[0.98]";
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
				<div class="absolute top-2 right-2 opacity-0 transition-opacity duration-fast group-hover/card:opacity-100 focus-within:opacity-100 pointer-coarse:hidden">
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
			class="flex min-h-0 w-full shrink-0 snap-start flex-col md:w-72"
		>
			<div
				onDragOver={(event) => props.onDragOver?.(event)}
				onDragLeave={(event) => props.onDragLeave?.(event)}
				onDrop={(event) => props.onDrop?.(event)}
				class={`flex min-h-0 flex-1 flex-col gap-2 rounded-kit-xl p-2 transition-colors duration-fast ${props.highlight ? "bg-fill-strong" : "bg-surface-sunken"}`}
			>
				<header
					class={`h-8 items-center gap-2 px-1.5 ${props.headerFromMd ? "hidden md:flex" : "flex"}`}
				>
					{props.icon}
					<h2 class="text-body text-fg">{props.title}</h2>
					<span data-count class="text-caption text-fg-subtle tabular-nums">
						{String(props.count)}
					</span>
					<span class="flex-1" />
					{props.action}
				</header>
				{props.top}
				<div class="-mx-2 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-2 pb-1">
					{props.children}
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
