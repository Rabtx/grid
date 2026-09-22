import type { JSX } from "@solidjs/web";
import { createMemo, For, Loading, Show } from "solid-js";

import { useWorkspace } from "../context/workspace-context";
import { groupByStatus } from "../lib/board";
import {
	TASK_STATUS_LABELS,
	TASK_STATUSES,
	type Task,
	type TaskStatus,
} from "../types/project.types";

export function BoardScreen(): JSX.Element {
	const workspace = useWorkspace();
	const columns = createMemo(() => groupByStatus(workspace.tasks()));

	return (
		<Loading fallback={<p class="text-muted-foreground text-ui-sm">Loading board…</p>}>
			<Show when={workspace.activeProject()} fallback={<ProjectNotFound />}>
				<div class="min-w-0 overflow-x-auto pb-2">
					<div class="flex min-w-max gap-3">
						<For each={TASK_STATUSES}>
							{(status) => <BoardColumn status={status} tasks={columns()[status]} />}
						</For>
					</div>
				</div>
			</Show>
		</Loading>
	);
}

function ProjectNotFound(): JSX.Element {
	return (
		<div class="space-y-2 py-8">
			<h1 class="font-semibold text-title">Project not found</h1>
			<p class="text-muted-foreground text-ui">It may have been renamed or archived.</p>
			<a href="/board" class="inline-flex min-h-row items-center text-primary text-ui underline">
				Open your first project
			</a>
		</div>
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
