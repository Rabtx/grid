import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, Loading, Show, untrack } from "solid-js";

import { useAuth } from "@/modules/auth";
import {
	Button,
	CloseIcon,
	ConfirmDialog,
	EmptyState,
	ErrorNotice,
	IconButton,
	Input,
	SegmentedControl,
	Select,
	Sheet,
	Skeleton,
	Textarea,
} from "@/ui";

import { useWorkspace } from "../context/workspace-context";
import { relativeTime } from "../lib/relative-time";
import { projectsService } from "../services/projects.service";
import {
	TASK_STATUS_LABELS,
	TASK_STATUSES,
	type Task,
	type TaskOwnerKind,
	type TaskStatus,
	type UpdateTaskInput,
} from "../types/project.types";

const STATUS_OPTIONS = TASK_STATUSES.map((status) => ({
	value: status,
	label: TASK_STATUS_LABELS[status],
}));

const OWNER_OPTIONS = [
	{ value: "none", label: "None" },
	{ value: "human", label: "Human" },
	{ value: "agent", label: "Agent" },
] as const;

type OwnerChoice = (typeof OWNER_OPTIONS)[number]["value"];

/**
 * The open task, over the board. It is mounted once per board route and driven entirely by the
 * URL — `/board/:slug/tasks/:number` opens it, the plain board URL closes it — so the panel,
 * a shared link and a reload all agree on which task is showing.
 */
export function TaskPanel(): JSX.Element {
	const workspace = useWorkspace();
	const number = () => workspace.activeTaskNumber();

	return (
		<Sheet
			placement="panel"
			open={number() !== null}
			onClose={workspace.closeTask}
			// Naming the sheet from the task itself would read the board's first load outside the
			// Loading boundary below, which defers the whole app's first render until it settles.
			label={number() === null ? "Task" : `Task ${number()}`}
		>
			<Loading fallback={<PanelSkeleton />}>
				<Show when={workspace.activeTask()} fallback={<TaskNotFound />}>
					{(task) => <TaskFields task={task()} />}
				</Show>
			</Loading>
		</Sheet>
	);
}

function TaskFields(props: { task: Task }): JSX.Element {
	const auth = useAuth();
	const workspace = useWorkspace();
	// The drafts start neutral and are seeded from the task below: a `props` read in a component
	// body is untracked, so Solid's dev build flags it instead of letting it silently not update.
	const [title, setTitle] = createSignal("");
	const [status, setStatus] = createSignal<TaskStatus>("backlog");
	const [ownerKind, setOwnerKind] = createSignal<TaskOwnerKind | null>(null);
	const [ownerName, setOwnerName] = createSignal("");
	const [branch, setBranch] = createSignal("");
	const [description, setDescription] = createSignal("");
	// A counter, not a flag: two fields can be in flight after a quick edit and a blur.
	const [saveCount, setSaveCount] = createSignal(0);
	const [error, setError] = createSignal<string | null>(null);
	const [confirming, setConfirming] = createSignal(false);
	const [deleting, setDeleting] = createSignal(false);

	const saving = () => saveCount() > 0;
	const ownerChoice = () => ownerKind() ?? "none";

	// Seeding is keyed on the task's number, not on the task object: a board refresh after a save
	// must not overwrite an edit the user is still typing in another field. The read is untracked
	// to say so, since an effect's apply phase cannot track.
	createEffect(
		() => props.task.number,
		() => {
			const task = untrack(() => props.task);
			setTitle(task.title);
			setStatus(task.status);
			setOwnerKind(task.owner?.kind ?? null);
			setOwnerName(task.owner?.name ?? "");
			setBranch(task.branch ?? "");
			setDescription(task.description ?? "");
			setError(null);
		},
	);

	/** Send one changed field, then re-read the board. `restore` puts the field back on failure. */
	async function save(input: UpdateTaskInput, restore: () => void): Promise<void> {
		const token = auth.token();
		const slug = workspace.activeSlug();
		if (!token || !slug) return;

		setError(null);
		setSaveCount((count) => count + 1);
		try {
			await projectsService.updateTask(token, slug, props.task.number, input);
			workspace.refreshTasks();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not save the task");
			restore();
		} finally {
			setSaveCount((count) => count - 1);
		}
	}

	async function commitTitle(): Promise<void> {
		const task = props.task;
		const next = title().trim();
		if (next.length === 0) {
			setTitle(task.title);
			return;
		}
		setTitle(next);
		if (next === task.title) return;
		await save({ title: next }, () => setTitle(task.title));
	}

	async function changeStatus(value: string): Promise<void> {
		const next = TASK_STATUSES.find((candidate) => candidate === value);
		if (!next || next === props.task.status) return;
		const previous = props.task.status;
		setStatus(next);
		await save({ status: next }, () => setStatus(previous));
	}

	async function changeOwnerKind(next: OwnerChoice): Promise<void> {
		const kind: TaskOwnerKind | null = next === "none" ? null : next;
		const previous = props.task.owner?.kind ?? null;
		if (kind === previous) return;
		setOwnerKind(kind);
		await save({ ownerKind: kind }, () => setOwnerKind(previous));
	}

	async function commitOwnerName(): Promise<void> {
		const previous = props.task.owner?.name ?? "";
		const next = ownerName().trim();
		setOwnerName(next);
		if (next === previous) return;
		await save({ ownerName: next.length === 0 ? null : next }, () => setOwnerName(previous));
	}

	async function commitBranch(): Promise<void> {
		const previous = props.task.branch ?? "";
		const next = branch().trim();
		setBranch(next);
		if (next === previous) return;
		await save({ branch: next.length === 0 ? null : next }, () => setBranch(previous));
	}

	async function commitDescription(): Promise<void> {
		const previous = props.task.description ?? "";
		const next = description();
		if (next === previous) return;
		await save({ description: next.trim().length === 0 ? null : next }, () =>
			setDescription(previous),
		);
	}

	async function deleteTask(): Promise<void> {
		const token = auth.token();
		const slug = workspace.activeSlug();
		if (!token || !slug) return;

		setDeleting(true);
		setError(null);
		try {
			await projectsService.deleteTask(token, slug, props.task.number);
			setConfirming(false);
			workspace.closeTask();
			workspace.refreshTasks();
		} catch (cause) {
			setConfirming(false);
			setError(cause instanceof Error ? cause.message : "Could not delete the task");
		} finally {
			setDeleting(false);
		}
	}

	return (
		<div class="flex h-full min-h-0 flex-col">
			<header class="flex min-h-10 shrink-0 items-center gap-2 border-stroke border-b px-3">
				<span class="font-mono text-ink/45 text-ui-xs">{props.task.key}</span>
				<span class="min-w-0 flex-1 truncate text-ink/35 text-ui-xs">
					· updated {relativeTime(props.task.updatedAt)}
				</span>
				<Show when={saving()}>
					<span class="shrink-0 text-ink/40 text-ui-xs">Saving…</span>
				</Show>
				<IconButton
					label="Delete task"
					class="hover:bg-danger/10 hover:text-danger"
					onClick={() => setConfirming(true)}
				>
					<TrashIcon />
				</IconButton>
				<IconButton label="Close task" onClick={workspace.closeTask}>
					<CloseIcon />
				</IconButton>
			</header>

			<div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
				<Show when={error()}>{(message) => <ErrorNotice message={message()} />}</Show>

				<input
					value={title()}
					onInput={(event) => setTitle(event.currentTarget.value)}
					onBlur={() => void commitTitle()}
					onKeyDown={saveOnEnter}
					placeholder="Task title"
					aria-label="Task title"
					maxlength={200}
					class="focus-ring w-full min-w-0 rounded-sm bg-transparent font-semibold text-ink text-title outline-none placeholder:text-ink/35"
				/>

				<div class="flex flex-col gap-1 md:flex-row md:items-center md:gap-3">
					<span class="shrink-0 text-ink/45 text-ui-sm md:w-24">Status</span>
					<Select
						aria-label="Status"
						class="w-full min-w-0 md:w-56"
						options={STATUS_OPTIONS}
						value={status()}
						onChange={(value) => void changeStatus(value)}
					/>
				</div>

				<div class="flex flex-col gap-1 md:flex-row md:items-center md:gap-3">
					<span class="shrink-0 text-ink/45 text-ui-sm md:w-24">Owner</span>
					<div class="flex min-w-0 flex-col gap-2 md:flex-row md:items-center md:gap-2">
						<SegmentedControl
							label="Owner"
							options={OWNER_OPTIONS}
							value={ownerChoice()}
							onChange={(next) => void changeOwnerKind(next)}
						/>
						<Show when={ownerKind()}>
							<Input
								value={ownerName()}
								onInput={(event) => setOwnerName(event.currentTarget.value)}
								onBlur={() => void commitOwnerName()}
								onKeyDown={saveOnEnter}
								aria-label="Owner name"
								placeholder={ownerKind() === "agent" ? "Agent name" : "Person's name"}
								class="w-full min-w-0 md:w-48"
							/>
						</Show>
					</div>
				</div>

				<div class="flex flex-col gap-1 md:flex-row md:items-center md:gap-3">
					<span class="shrink-0 text-ink/45 text-ui-sm md:w-24">Branch</span>
					<Input
						value={branch()}
						onInput={(event) => setBranch(event.currentTarget.value)}
						onBlur={() => void commitBranch()}
						onKeyDown={saveOnEnter}
						aria-label="Branch"
						placeholder="agent/role/card-slug"
						class="w-full min-w-0 font-mono"
					/>
				</div>

				<div class="flex flex-col gap-1 md:flex-row md:items-start md:gap-3">
					<span class="shrink-0 text-ink/45 text-ui-sm md:w-24 md:pt-2">Description</span>
					<Textarea
						value={description()}
						onInput={(event) => setDescription(event.currentTarget.value)}
						onBlur={() => void commitDescription()}
						aria-label="Description"
						placeholder="Context a teammate or an agent needs"
						class="w-full min-w-0 whitespace-pre-wrap"
					/>
				</div>
			</div>

			<ConfirmDialog
				open={confirming()}
				title={`Delete ${props.task.key}?`}
				description="This can't be undone."
				confirmLabel="Delete task"
				tone="danger"
				pending={deleting()}
				onConfirm={() => void deleteTask()}
				onCancel={() => setConfirming(false)}
			/>
		</div>
	);
}

/** Enter in a single-line field saves it, exactly as leaving the field does. */
function saveOnEnter(event: KeyboardEvent & { currentTarget: HTMLInputElement }): void {
	if (event.key !== "Enter") return;
	event.preventDefault();
	event.currentTarget.blur();
}

function PanelSkeleton(): JSX.Element {
	return (
		<div class="flex h-full flex-col">
			<div class="min-h-10 shrink-0 border-stroke border-b" />
			<div class="flex flex-col gap-3 p-4">
				<Skeleton class="h-6 w-2/3" />
				<Skeleton class="h-field w-full" />
				<Skeleton class="h-field w-full" />
				<Skeleton class="h-24 w-full" />
			</div>
		</div>
	);
}

function TaskNotFound(): JSX.Element {
	const workspace = useWorkspace();

	return (
		<div class="flex h-full min-h-0 flex-col">
			<header class="flex min-h-10 shrink-0 items-center justify-end border-stroke border-b px-3">
				<IconButton label="Close task" onClick={workspace.closeTask}>
					<CloseIcon />
				</IconButton>
			</header>
			<EmptyState
				title="Task not found"
				description="It may have been deleted, or the link may be wrong."
				action={
					<Button variant="secondary" onClick={workspace.closeTask}>
						Back to the board
					</Button>
				}
			/>
		</div>
	);
}

/**
 * The delete glyph, drawn to the same 24px grid and stroke weight as the `@/ui` set. It belongs
 * there once that package owns a trash icon; kept local for now rather than widening this card.
 */
function TrashIcon(): JSX.Element {
	return (
		<svg
			viewBox="0 0 24 24"
			class="size-4"
			fill="none"
			stroke="currentColor"
			stroke-width="1.75"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M5 7h14M10 7V5.5h4V7M7.5 7l.7 11a1.5 1.5 0 0 0 1.5 1.4h4.6a1.5 1.5 0 0 0 1.5-1.4L16.5 7" />
		</svg>
	);
}
