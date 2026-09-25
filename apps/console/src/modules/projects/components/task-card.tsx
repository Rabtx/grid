import { useLocation, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { onSettled, Show } from "solid-js";

import { draftsStore, taskDraft } from "@/modules/chat/stores/drafts";
import { attachContextMenu, ChatIcon, Menu, type MenuControl, MoreIcon } from "@/ui";

import { useWorkspace } from "../context/workspace-context";
import {
	TASK_STATUS_LABELS,
	TASK_STATUSES,
	type Task,
	type TaskStatus,
} from "../types/project.types";

import { StatusIcon } from "./status-icon";

/**
 * The card's "Move to…" button is for pointers: revealed on hover or keyboard focus. Touch
 * screens draw no button — a long press on the card opens the same menu, as native apps do.
 */
const ACTIONS_CLASS =
	"absolute top-1 right-1 opacity-0 transition-opacity duration-fast ease-out-grid group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100";

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
	const navigate = useNavigate();
	// Carry the board's filters into the task URL, so closing the panel returns to the same view.
	const location = useLocation();

	// Run with agent opens a new chat thread; moving to the current stage is not offered.
	function actionItems(): { id: string; label: string; icon: JSX.Element }[] {
		return [
			{
				id: "run-with-agent",
				label: "Run with agent",
				icon: <ChatIcon class="size-3.5 shrink-0" />,
			},
			...TASK_STATUSES.filter((status) => status !== props.task.status).map((status) => ({
				id: status,
				label: TASK_STATUS_LABELS[status],
				icon: <StatusIcon status={status} />,
			})),
		];
	}

	let menu: MenuControl | undefined;
	let card: HTMLDivElement | undefined;
	// Right-click and long press open the card's action menu.
	onSettled(() => (card ? attachContextMenu(card, (point) => menu?.open(point)) : undefined));

	function handleSelect(id: string): void {
		if (id === "run-with-agent") {
			const slug = workspace.activeSlug();
			if (!slug) return;
			draftsStore.set(slug, taskDraft(props.task));
			navigate(`/chat/${slug}`);
			return;
		}
		const status = TASK_STATUSES.find((candidate) => candidate === id);
		if (status) props.onMove(status);
	}

	return (
		<div
			class={`group relative select-none [-webkit-touch-callout:none] ${props.dragging ? "opacity-50" : ""}`}
			ref={(el) => {
				card = el;
			}}
		>
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
				<article class="flex flex-col gap-1.5 p-2.5 pr-9 pointer-coarse:pr-2.5">
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
					items={actionItems()}
					onSelect={handleSelect}
					pointerOnly
					control={(control) => {
						menu = control;
					}}
				/>
			</div>
		</div>
	);
}
