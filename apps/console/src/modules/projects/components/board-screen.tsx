import type { JSX } from "@solidjs/web";
import { createMemo, createSignal, For, Loading, Show } from "solid-js";

import { useAuth } from "@/modules/auth";

import { groupByStatus } from "../lib/board";
import { projectsService } from "../services/projects.service";
import {
	TASK_STATUS_LABELS,
	TASK_STATUSES,
	type Task,
	type TaskStatus,
} from "../types/project.types";

export function BoardScreen(): JSX.Element {
	const auth = useAuth();
	const [selectedSlug, setSelectedSlug] = createSignal<string | null>(null);
	// Bumped after every write so the async reads below re-run. An explicit token
	// beats reaching for a refetch helper: the dependency is visible in the memo.
	const [revision, setRevision] = createSignal(0);

	const projects = createMemo(async () => {
		const token = auth.token();
		if (!token) return [];
		return projectsService.list(token);
	});

	const activeSlug = createMemo(() => selectedSlug() ?? projects()[0]?.slug ?? null);

	const tasks = createMemo(async () => {
		revision();
		const token = auth.token();
		const slug = activeSlug();
		if (!token || !slug) return [];
		return projectsService.listTasks(token, slug);
	});

	const columns = createMemo(() => groupByStatus(tasks()));

	return (
		<Loading fallback={<p class="text-muted-foreground text-ui-sm">Loading board…</p>}>
			<div class="flex min-w-0 flex-col gap-4">
				<header class="flex min-w-0 flex-wrap items-end justify-between gap-3">
					<div class="min-w-0 space-y-1">
						<h1 class="font-semibold text-title tracking-tight">Board</h1>
						<p class="text-muted-foreground text-ui-sm">
							{tasks().length} task{tasks().length === 1 ? "" : "s"} across {TASK_STATUSES.length}{" "}
							stages
						</p>
					</div>
					<label class="flex items-center gap-2 text-muted-foreground text-ui-xs">
						Project
						<select
							class="h-7 rounded-md border border-border bg-background px-2 text-foreground text-ui-input outline-none focus-visible:border-ring"
							onChange={(event) => setSelectedSlug(event.currentTarget.value)}
						>
							<For each={projects()}>
								{(project) => (
									<option value={project.slug} selected={project.slug === activeSlug()}>
										{project.name}
									</option>
								)}
							</For>
						</select>
					</label>
				</header>

				<NewTaskForm slug={activeSlug()} onCreated={() => setRevision((n) => n + 1)} />

				<div class="min-w-0 overflow-x-auto pb-2">
					<div class="flex min-w-max gap-3">
						<For each={TASK_STATUSES}>
							{(status) => <BoardColumn status={status} tasks={columns()[status]} />}
						</For>
					</div>
				</div>
			</div>
		</Loading>
	);
}

function BoardColumn(props: { status: TaskStatus; tasks: Task[] }): JSX.Element {
	return (
		<section class="flex w-64 shrink-0 flex-col gap-2">
			<header class="flex items-center justify-between gap-2 px-1">
				<h2 class="font-medium text-ui-xs uppercase tracking-wide">
					{TASK_STATUS_LABELS[props.status]}
				</h2>
				<span class="font-mono text-ui-xs text-muted-foreground">{props.tasks.length}</span>
			</header>
			<div class="flex min-h-16 flex-col gap-2 rounded-lg border border-border/60 bg-muted/20 p-2">
				<Show
					when={props.tasks.length > 0}
					fallback={<p class="px-1 py-2 text-muted-foreground text-ui-xs">Empty</p>}
				>
					<For each={props.tasks}>{(task) => <TaskCard task={task} />}</For>
				</Show>
			</div>
		</section>
	);
}

function TaskCard(props: { task: Task }): JSX.Element {
	return (
		<article class="w-full space-y-2 rounded-md border border-border bg-card p-2.5 text-left">
			<span class="flex items-baseline justify-between gap-2">
				<span class="font-mono text-ui-xs text-muted-foreground">{props.task.key}</span>
				<Show when={props.task.owner}>
					{(owner) => (
						<span class="rounded border border-border px-1.5 py-0.5 text-ui-xs">
							{owner().name ?? owner().kind}
						</span>
					)}
				</Show>
			</span>
			<span class="block font-medium text-ui leading-5">{props.task.title}</span>
			<Show when={props.task.branch}>
				{(branch) => (
					<span class="block truncate font-mono text-ui-xs text-muted-foreground">{branch()}</span>
				)}
			</Show>
		</article>
	);
}

function NewTaskForm(props: { slug: string | null; onCreated: () => void }): JSX.Element {
	const auth = useAuth();
	const [title, setTitle] = createSignal("");
	const [pending, setPending] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		const trimmed = title().trim();
		const token = auth.token();
		const slug = props.slug;
		if (!trimmed || !token || !slug) return;

		setError(null);
		setPending(true);
		try {
			await projectsService.createTask(token, slug, { title: trimmed });
			setTitle("");
			props.onCreated();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not add the task");
		} finally {
			setPending(false);
		}
	}

	return (
		<form class="flex min-w-0 flex-wrap items-center gap-2" onSubmit={submit}>
			<input
				value={title()}
				onInput={(event) => setTitle(event.currentTarget.value)}
				placeholder="New task title"
				maxlength={200}
				class="h-8 w-full rounded-md border border-border bg-background px-3 text-ui-input outline-none focus-visible:border-ring sm:w-72"
			/>
			<button
				type="submit"
				disabled={!title().trim() || pending()}
				class="h-8 rounded-md bg-primary px-3 font-medium text-primary-foreground text-ui disabled:opacity-60"
			>
				{pending() ? "Adding…" : "Add to backlog"}
			</button>
			<Show when={error()}>
				{(message) => <p class="text-destructive text-ui-xs">{message()}</p>}
			</Show>
		</form>
	);
}
