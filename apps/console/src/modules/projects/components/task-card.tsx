import { useLocation } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import { Menu } from "@/ui";

import { useWorkspace } from "../context/workspace-context";
import {
	TASK_STATUS_LABELS,
	TASK_STATUSES,
	type Task,
	type TaskStatus,
} from "../types/project.types";

import { StatusIcon } from "./status-icon";

/**
 * The card's actions are always visible on touch, and revealed on hover or keyboard focus where
 * a pointer can hover (Tailwind scopes `hover:` to `(hover: hover)` itself; the arbitrary variant
 * is the matching "hide only where hovering exists" half of it).
 */
const ACTIONS_CLASS =
	"absolute top-1 right-1 transition-opacity duration-fast ease-out-grid opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 group-focus-within:opacity-100";

/**
 * A task on the board: key, title, then who owns it and where the work lives.
 *
 * The card body is a link to the task's own URL, so the panel opens over the board, the URL
 * can be shared, and a reload lands on the same task. The "Move to…" menu is a sibling of that
 * link rather than a child, so opening it never navigates.
 */
export function TaskCard(props: {
	task: Task;
	/** Move the task to another stage, the same way the lane drop does. */
	onMove: (status: TaskStatus) => void;
	/** HTML5 drag source: switched on only where the pointer can drag and drop. */
	canDrag?: boolean;
	dragging?: boolean;
	onDragStart?: () => void;
	onDragEnd?: () => void;
}): JSX.Element {
	const workspace = useWorkspace();
	// Carry the board's filters into the task URL, so closing the panel returns to the same view.
	const location = useLocation();

	// Moving to the stage the card is already in is not a move, so it is not offered.
	function moveItems(): { id: string; label: string; icon: JSX.Element }[] {
		return TASK_STATUSES.filter((status) => status !== props.task.status).map((status) => ({
			id: status,
			label: TASK_STATUS_LABELS[status],
			icon: <StatusIcon status={status} />,
		}));
	}

	function move(id: string): void {
		const status = TASK_STATUSES.find((candidate) => candidate === id);
		if (status) props.onMove(status);
	}

	return (
		<div class={`group relative ${props.dragging ? "opacity-50" : ""}`}>
			{/* The link wraps a whole card, so it is named explicitly: the label repeats what is visible. */}
			<a
				href={`/board/${workspace.activeSlug()}/tasks/${props.task.number}${location.search}`}
				aria-label={`${props.task.key} ${props.task.title}`}
				draggable={props.canDrag ? "true" : undefined}
				onDragStart={(event) => {
					// A drag needs a payload of its own, or the browser refuses to start one.
					event.dataTransfer?.setData("text/plain", String(props.task.number));
					if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
					props.onDragStart?.();
				}}
				onDragEnd={() => props.onDragEnd?.()}
				class={`focus-ring block rounded-lg border border-ink/10 bg-ink/5 transition-[background-color,transform] duration-fast ease-out-grid hover:bg-ink/8 active:scale-[0.98] ${
					props.canDrag ? "cursor-grab active:cursor-grabbing" : ""
				}`}
			>
				<article class="flex flex-col gap-1.5 p-2.5 pr-9 pointer-coarse:pr-13">
					<span class="font-mono text-ink/40 text-ui-caption">{props.task.key}</span>
					<p class="line-clamp-3 break-words font-medium text-ink/90 text-ui leading-snug">
						{props.task.title}
					</p>
					<div class="flex min-w-0 items-center gap-2 pt-0.5 text-ink/45 text-ui-xs">
						<Show
							when={props.task.owner}
							fallback={
								<>
									<span
										class="size-3.5 shrink-0 rounded-full border border-ink/30 border-dashed"
										aria-hidden="true"
									/>
									<span>Unassigned</span>
								</>
							}
						>
							{(owner) => (
								<>
									<span class="size-3.5 shrink-0 rounded-full bg-ink/20" aria-hidden="true" />
									<span class="max-w-[60%] shrink-0 truncate">{owner().name ?? owner().kind}</span>
								</>
							)}
						</Show>
						<Show when={props.task.branch}>
							{(branch) => (
								<span class="ml-auto min-w-0 truncate font-mono" title={branch()}>
									{branch()}
								</span>
							)}
						</Show>
					</div>
				</article>
			</a>
			<div class={ACTIONS_CLASS}>
				<Menu
					label={`Move ${props.task.key}`}
					trigger={<MoreIcon />}
					items={moveItems()}
					onSelect={move}
				/>
			</div>
		</div>
	);
}

/**
 * The "more" glyph, drawn to the same 24px grid as the `@/ui` set, which has no ellipsis icon.
 * It belongs there once that package owns one; kept local for now rather than widening this card.
 */
function MoreIcon(): JSX.Element {
	return (
		<svg viewBox="0 0 24 24" class="size-4" fill="currentColor" aria-hidden="true">
			<circle cx="12" cy="5.5" r="1.5" />
			<circle cx="12" cy="12" r="1.5" />
			<circle cx="12" cy="18.5" r="1.5" />
		</svg>
	);
}
