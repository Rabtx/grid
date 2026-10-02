import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, createSignal, For, onSettled, Show } from "solid-js";

import { useAuth } from "@/modules/auth";
import {
	Alert,
	BoardColumn,
	DoneRow,
	IconButton,
	InlineAdd,
	LaneStrip,
	LinkButton,
	notify,
	PlusIcon,
	Text,
} from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";

import { type NewTaskDefaults, useWorkspace } from "../context/workspace-context";
import { laneOf, laneStatus as statusForLane, ownerKey } from "../lib/board";
import { applyMove, nextPosition } from "../lib/move-task";
import { projectsService } from "../services/projects.service";
import { type Task, type TaskStatus } from "../types/project.types";

import { OwnerMark, TaskCard } from "./task-card";

export type BoardLane = {
	id: string;
	title: string;
	/** Its name in the phone tabs: "Doing" for In progress. */
	short: string;
	/** Drawn fresh for each place that shows it: one DOM node can only sit in one place. */
	icon: () => JSX.Element;
	tasks: Task[];
};

/** How long a failed move stays on screen before it clears itself. */
const MOVE_ERROR_MS = 6000;

/** One shared empty list, so an empty lane keeps the same value between reads. */
const NO_TASKS: Task[] = [];

/** A move on its way to the API; `landed` once the write succeeded and the board is re-reading. */
type PendingMove = { number: number; status: TaskStatus; landed?: boolean };

export function boardLaneId(id: string): string {
	return `lane-${id}`;
}

/**
 * The board's lanes. Stages are also drop targets, so a task can be dragged from one to another
 * where the pointer allows it; everywhere else the card's own menu moves it. Both paths go
 * through the same optimistic move.
 */
export function BoardLanes(props: {
	lanes: BoardLane[];
	onActiveChange: (laneId: string) => void;
}): JSX.Element {
	const workspace = useWorkspace();
	const auth = useAuth();
	// Read once, in one place: a fine pointer drags, everything else uses the card's menu.
	const canDrag = typeof matchMedia === "function" && matchMedia("(pointer: fine)").matches;
	// Moves that are on their way to the API, laid over the workspace tasks so the board answers
	// at once. One entry per task: a second move replaces the first before either lands.
	const [pending, setPending] = createSignal<PendingMove[]>([]);
	const [moveError, setMoveError] = createSignal<string | null>(null);
	const [dragging, setDragging] = createSignal<number | null>(null);
	const [dropTarget, setDropTarget] = createSignal<string | null>(null);
	let errorTimer: ReturnType<typeof setTimeout> | undefined;
	let scroller: HTMLDivElement | undefined;
	let observer: IntersectionObserver | undefined;

	function clearMoveError(): void {
		if (errorTimer !== undefined) {
			clearTimeout(errorTimer);
			errorTimer = undefined;
		}
		setMoveError(null);
	}

	function showMoveError(message: string): void {
		clearMoveError();
		setMoveError(message);
		errorTimer = setTimeout(() => {
			errorTimer = undefined;
			setMoveError(null);
		}, MOVE_ERROR_MS);
	}

	// Every task the lanes currently show, whatever the view and filters are.
	const shownTasks = createMemo(() => props.lanes.flatMap((lane) => lane.tasks));

	const movedTasks = createMemo(() =>
		pending().reduce((tasks, move) => applyMove(tasks, move.number, move.status), shownTasks()),
	);

	// Re-bucket the overlay into the lane each task belongs to: a stage lane by status, an owner
	// lane by owner, which a status change never alters. The lanes themselves keep their identity,
	// so only the task lists inside them change.
	const overlaidByLane = createMemo(() => {
		if (pending().length === 0) {
			return new Map(props.lanes.map((lane) => [lane.id, lane.tasks]));
		}
		const laneIds = new Set(props.lanes.map((lane) => lane.id));
		const buckets = new Map<string, Task[]>();
		for (const task of movedTasks()) {
			const key = laneIds.has(laneOf(task.status)) ? laneOf(task.status) : ownerKey(task);
			const bucket = buckets.get(key);
			if (bucket) bucket.push(task);
			else buckets.set(key, [task]);
		}
		return buckets;
	});

	async function move(task: Task, status: TaskStatus): Promise<void> {
		if (task.status === status) return;
		const token = auth.token();
		const slug = workspace.activeSlug();
		if (!token || !slug) return;

		// Appended after whatever is already in the stage, counted with the moves in flight.
		const position = nextPosition(movedTasks(), status);
		setPending((moves) => [
			...moves.filter((move) => move.number !== task.number),
			{ number: task.number, status },
		]);
		clearMoveError();
		try {
			await projectsService.updateTask(token, slug, task.number, { status, position });
			// Keep the card where it was dropped until the re-read tasks arrive, so it never
			// jumps back to its old lane in between.
			setPending((moves) =>
				moves.map((move) => (move.number === task.number ? { ...move, landed: true } : move)),
			);
			workspace.refreshTasks();
		} catch (cause) {
			setPending((moves) => moves.filter((move) => move.number !== task.number));
			showMoveError(
				`Couldn't move ${task.key}: ${cause instanceof Error ? cause.message : "the move was rejected"}`,
			);
		}
	}

	function laneStatus(id: string): TaskStatus | null {
		return statusForLane(id);
	}
	// Done shows its newest few; the rest wait behind "Show more".
	const [showAllDone, setShowAllDone] = createSignal(false);
	const DONE_SHOWN = 5;
	// A new project, view or filter starts folded again.
	createEffect(
		() => `${workspace.activeSlug()}|${props.lanes.map((lane) => lane.id).join(",")}`,
		() => {
			setShowAllDone(false);
		},
	);
	/** Done, newest first: what was just finished is what you look for. */
	const newestFirst = (tasks: Task[]) =>
		[...tasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

	function endDrag(): void {
		setDragging(null);
		setDropTarget(null);
	}

	function observeCurrentLanes(): void {
		if (!scroller || !observer) return;
		observer.disconnect();
		for (const lane of scroller.querySelectorAll<HTMLElement>("[data-lane]")) {
			observer.observe(lane);
		}
	}

	onSettled(() => {
		observer = new IntersectionObserver(
			(entries) => {
				const visible = entries.find((entry) => entry.isIntersecting);
				const lane = visible?.target.getAttribute("data-lane");
				if (lane) props.onActiveChange(lane);
			},
			{ root: scroller, threshold: 0.6 },
		);
		observeCurrentLanes();
		return () => {
			observer?.disconnect();
			observer = undefined;
			clearMoveError();
		};
	});

	createEffect(() => props.lanes.map((lane) => lane.id).join("|"), observeCurrentLanes);

	// Fresh tasks from the API already carry every landed move, so those overlays can go.
	createEffect(workspace.tasks, () => {
		setPending((moves) =>
			moves.some((move) => move.landed) ? moves.filter((move) => !move.landed) : moves,
		);
	});

	return (
		<>
			<Show when={moveError()}>
				{(message) => (
					<div class="mb-2 shrink-0">
						<Alert tone="danger" title={message()} onDismiss={clearMoveError} />
					</div>
				)}
			</Show>
			<LaneStrip
				ref={(el) => {
					scroller = el;
				}}
			>
				<For each={props.lanes} keyed={false}>
					{(lane) => {
						// This lane's tasks, with the moves that are still in flight laid over them.
						const laneTasks = () => overlaidByLane().get(lane().id) ?? NO_TASKS;
						return (
							<BoardColumn
								id={boardLaneId(lane().id)}
								title={lane().title}
								icon={lane().icon()}
								count={laneTasks().length}
								highlight={dropTarget() === lane().id}
								// Phones name the lane in the stage tabs above, so the header only shows from md.
								headerFromMd
								action={
									<IconButton
										size="xs"
										label={`Add a task to ${lane().title}`}
										onClick={() => workspace.openNewTask(laneDefaults(lane().id))}
									>
										<PlusIcon size="sm" />
									</IconButton>
								}
								bottom={
									<>
										<Show when={lane().id === "done" && laneTasks().length > DONE_SHOWN}>
											<LinkButton
												onClick={() => setShowAllDone((open) => !open)}
												class="self-start px-2 py-1"
											>
												{showAllDone()
													? "Show less"
													: `Show ${laneTasks().length - DONE_SHOWN} more`}
											</LinkButton>
										</Show>
										{/* Typing a title at the foot of Todo adds it there (Figma "Add a task"). */}
										<Show when={lane().id === "todo"}>
											<QuickAdd status="ready" />
										</Show>
									</>
								}
								onDragOver={(event) => {
									// Only a stage lane can receive the task, and only mid-drag.
									const status = laneStatus(lane().id);
									if (!canDrag || status === null || dragging() === null) return;
									event.preventDefault();
									if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
									setDropTarget(lane().id);
								}}
								onDragLeave={(event) => {
									const next = event.relatedTarget as Node | null;
									if (next && (event.currentTarget as HTMLElement).contains(next)) return;
									if (dropTarget() === lane().id) setDropTarget(null);
								}}
								onDrop={(event) => {
									const status = laneStatus(lane().id);
									event.preventDefault();
									const number = dragging();
									const task = movedTasks().find((item) => item.number === number);
									endDrag();
									// Dropped back in its own column (a blocked task on In progress): it stays as it is.
									if (status === null || !task || laneOf(task.status) === lane().id) return;
									void move(task, status);
								}}
							>
								<Show
									when={laneTasks().length > 0}
									fallback={
										<Text size="caption" tone="faint" class="px-2 py-2">
											No tasks
										</Text>
									}
								>
									<Show
										when={lane().id === "done"}
										fallback={
											<For each={laneTasks()}>
												{(task) => (
													<TaskCard
														task={task}
														canDrag={canDrag}
														dragging={dragging() === task.number}
														onDragStart={() => setDragging(task.number)}
														onDragEnd={endDrag}
														onMove={(status) => void move(task, status)}
													/>
												)}
											</For>
										}
									>
										<For
											each={
												showAllDone()
													? newestFirst(laneTasks())
													: newestFirst(laneTasks()).slice(0, DONE_SHOWN)
											}
										>
											{(task) => (
												<DoneRow
													title={task.title}
													label={`${task.key} ${task.title}, done${task.owner?.name ? `, ${task.owner.name}` : ""}`}
													href={workspaceHref(
														`/board/${workspace.activeSlug()}/tasks/${task.number}`,
													)}
													owner={<OwnerMark task={task} />}
												/>
											)}
										</For>
									</Show>
								</Show>
							</BoardColumn>
						);
					}}
				</For>
			</LaneStrip>
		</>
	);
}

/** What a task added from a lane starts with: the lane's stage, or its owner. */
function laneDefaults(laneId: string): NewTaskDefaults {
	const status = statusForLane(laneId);
	if (status) return { status };
	if (laneId === "unassigned") return {};
	const [kind, ...name] = laneId.split(":");
	return kind === "human" || kind === "agent"
		? { ownerKind: kind, ownerName: name.join(":") || null }
		: {};
}

/**
 * Type a title at the top of a lane and press Enter: the task is added to that stage and the
 * field stays ready for the next. Escape (or leaving it empty) closes it.
 */
function QuickAdd(props: { status: TaskStatus }): JSX.Element {
	const auth = useAuth();
	const workspace = useWorkspace();

	return (
		<InlineAdd
			label="Add task"
			icon={<PlusIcon size="sm" />}
			onAdd={async (title) => {
				const token = auth.token();
				const slug = workspace.activeSlug();
				if (!token || !slug) return;
				const task = await projectsService.createTask(token, slug, { title, status: props.status });
				workspace.refreshTasks();
				notify({
					title: `Added ${task.key}`,
					action: { label: "Open", run: () => workspace.openTask(task.number) },
				});
			}}
		/>
	);
}
