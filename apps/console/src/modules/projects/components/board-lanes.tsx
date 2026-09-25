import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, createSignal, For, onSettled, Show, untrack } from "solid-js";

import { useAuth } from "@/modules/auth";
import { Button, ErrorNotice, PlusIcon, Skeleton, toast } from "@/ui";

import { type NewTaskDefaults, useWorkspace } from "../context/workspace-context";
import { ownerKey } from "../lib/board";
import { applyMove, nextPosition } from "../lib/move-task";
import { projectsService } from "../services/projects.service";
import { TASK_STATUSES, type Task, type TaskStatus } from "../types/project.types";

import { TaskCard } from "./task-card";

export type BoardLane = {
	id: string;
	title: string;
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
			const key = laneIds.has(task.status) ? task.status : ownerKey(task);
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
		return TASK_STATUSES.find((status) => status === id) ?? null;
	}

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
					<div class="mb-2">
						<ErrorNotice
							message={message()}
							action={
								<Button size="sm" variant="secondary" onClick={clearMoveError}>
									Dismiss
								</Button>
							}
						/>
					</div>
				)}
			</Show>
			<div
				ref={(el) => {
					scroller = el;
				}}
				class="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-4 [scrollbar-width:none] motion-safe:scroll-smooth md:-mx-6 md:snap-none md:scroll-px-6 md:px-6 md:[scrollbar-width:thin] lg:-mx-4 lg:px-4"
			>
				<For each={props.lanes} keyed={false}>
					{(lane) => {
						// This lane's tasks, with the moves that are still in flight laid over them.
						const laneTasks = () => overlaidByLane().get(lane().id) ?? NO_TASKS;
						return (
							<section
								id={boardLaneId(lane().id)}
								data-lane={lane().id}
								aria-labelledby={`${boardLaneId(lane().id)}-title`}
								class="flex w-full shrink-0 snap-start flex-col md:w-[17.75rem]"
							>
								{/* The drop target: a plain wrapper, so the lane landmark itself stays non-interactive. */}
								<div
									class={`flex flex-1 flex-col rounded-lg transition-colors duration-fast ease-out-grid ${
										dropTarget() === lane().id ? "bg-selection-subtle" : ""
									}`}
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
										if (next && event.currentTarget.contains(next)) return;
										if (dropTarget() === lane().id) setDropTarget(null);
									}}
									onDrop={(event) => {
										const status = laneStatus(lane().id);
										event.preventDefault();
										const number = dragging();
										const task = movedTasks().find((item) => item.number === number);
										endDrag();
										if (status === null || !task) return;
										void move(task, status);
									}}
								>
									{/* Phones name the lane in the stage tabs above, so the header only shows from md. */}
									<header class="hidden h-9 items-center gap-2 px-1 md:flex">
										{lane().icon()}
										<h2
											id={`${boardLaneId(lane().id)}-title`}
											class="font-medium text-ink/80 text-ui-sm"
										>
											{lane().title}
										</h2>
										{/* A string, not a number: the test DOM drops a `0` text node and can't update it. */}
										<span data-count class="text-ink/40 text-ui-xs tabular-nums">
											{String(laneTasks().length)}
										</span>
										{/* Stages add inline below; owner lanes open the sheet with the owner set. */}
										<Show when={!laneStatus(lane().id)}>
											<button
												type="button"
												aria-label={`Add a task to ${lane().title}`}
												title="Add a task"
												class="focus-ring ml-auto grid size-6 place-items-center rounded-md text-ink/45 hover:bg-ink/8 hover:text-ink pointer-coarse:size-10"
												onClick={() => workspace.openNewTask(laneDefaults(lane().id))}
											>
												<PlusIcon class="size-3.5" />
											</button>
										</Show>
									</header>
									<Show when={laneStatus(lane().id)}>
										{(status) => <QuickAdd status={status()} />}
									</Show>
									<div class="flex flex-col gap-2 p-0.5">
										<Show
											when={laneTasks().length > 0}
											fallback={<p class="px-2 py-2 text-ink/30 text-ui-xs">No tasks</p>}
										>
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
										</Show>
									</div>
								</div>
							</section>
						);
					}}
				</For>
			</div>
		</>
	);
}

export function SkeletonLanes(): JSX.Element {
	return (
		<div class="flex gap-3" aria-hidden="true">
			<For each={[0, 1, 2, 3]}>
				{(index) => (
					<div
						class={`flex w-full shrink-0 flex-col gap-2 md:w-[17.75rem] ${index === 0 ? "" : "hidden md:flex"}`}
					>
						<Skeleton class="mx-1 my-2.5 h-4 w-24" />
						<Skeleton class="h-24 rounded-lg" />
						<Skeleton class="h-16 rounded-lg" />
					</div>
				)}
			</For>
		</div>
	);
}

/** What a task added from a lane starts with: the lane's stage, or its owner. */
function laneDefaults(laneId: string): NewTaskDefaults {
	if ((TASK_STATUSES as readonly string[]).includes(laneId))
		return { status: laneId as TaskStatus };
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
	const [open, setOpen] = createSignal(false);
	const [title, setTitle] = createSignal("");
	const [pending, setPending] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);

	async function add(): Promise<void> {
		const trimmed = title().trim();
		const token = auth.token();
		const slug = workspace.activeSlug();
		if (!trimmed || !token || !slug || pending()) return;
		setPending(true);
		setError(null);
		try {
			const task = await projectsService.createTask(token, slug, {
				title: trimmed,
				status: props.status,
			});
			setTitle("");
			workspace.refreshTasks();
			toast({
				message: `Added ${task.key}`,
				action: { label: "Open", onClick: () => workspace.openTask(task.number) },
			});
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not add the task");
		} finally {
			setPending(false);
		}
	}

	return (
		<div class="px-0.5 pb-2">
			<Show
				when={open()}
				fallback={
					<button
						type="button"
						class="focus-ring flex h-8 w-full items-center gap-1.5 rounded-lg px-2 text-left text-ink/40 text-ui-sm hover:bg-ink/5 hover:text-ink/70 pointer-coarse:h-11"
						onClick={() => setOpen(true)}
					>
						<PlusIcon class="size-3.5" />
						Add task
					</button>
				}
			>
				<form
					onSubmit={(event) => {
						event.preventDefault();
						void add();
					}}
				>
					<input
						ref={(el) => queueMicrotask(() => el.focus())}
						value={title()}
						onInput={(event) => setTitle(event.currentTarget.value)}
						onKeyDown={(event) => {
							if (event.key === "Escape") {
								setTitle("");
								setOpen(false);
							}
						}}
						onBlur={() => {
							if (!untrack(title).trim()) setOpen(false);
						}}
						aria-label="New task title"
						placeholder="Title, then Enter"
						maxlength={200}
						enterkeyhint="done"
						disabled={pending()}
						class="h-9 w-full rounded-lg border border-ink/15 bg-canvas px-2.5 text-ink text-ui-input outline-none placeholder:text-ink/35 focus:border-ink/30"
					/>
				</form>
				<Show when={error()}>
					{(message) => <p class="mt-1 px-1 text-danger text-ui-xs">{message()}</p>}
				</Show>
			</Show>
		</div>
	);
}
