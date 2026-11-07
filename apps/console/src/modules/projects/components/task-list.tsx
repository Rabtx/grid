import { useLocation } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createSignal, For, Show } from "solid-js";

import { ChevronDownIcon, IconButton, iconButton, Menu, notify, PlusIcon, Text } from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";
import { useAuth } from "@/modules/auth";

import { useWorkspace } from "../context/workspace-context";
import { nextPosition } from "../lib/move-task";
import { relativeTime } from "../lib/relative-time";
import { projectsService } from "../services/projects.service";
import type { Task, WorkflowState } from "../types/project.types";

import { StatusIcon } from "./status-icon";
import { OwnerMark } from "./task-card";

/**
 * The board as a list (after Linear's list view): a group per status in the workflow's order,
 * its header saying how many and offering a new task there, then a row per task — its status
 * (tap it to change it), key, title, who has it and when it last changed. A group folds away.
 */
export function TaskList(props: {
	states: readonly WorkflowState[];
	tasks: readonly Task[];
}): JSX.Element {
	const workspace = useWorkspace();
	const [folded, setFolded] = createSignal<ReadonlySet<string>>(new Set<string>());
	const inState = (key: string) => props.tasks.filter((task) => task.status === key);
	const toggle = (key: string) => {
		const next = new Set(folded());
		if (next.has(key)) next.delete(key);
		else next.add(key);
		setFolded(next);
	};

	return (
		<div class="-mx-gutter min-h-0 flex-1 overflow-y-auto overscroll-contain pb-8">
			<For each={props.states}>
				{(state) => (
					<section aria-label={state.name}>
						<header class="sticky top-0 z-10 flex h-10 items-center gap-2 border-line border-y bg-surface-sunken px-gutter">
							<button
								type="button"
								aria-expanded={folded().has(state.key) ? "false" : "true"}
								onClick={() => toggle(state.key)}
								class="focus-ring flex min-w-0 flex-1 items-center gap-2 text-left"
							>
								<ChevronDownIcon
									size="sm"
									class={`shrink-0 text-fg-subtle transition-transform duration-fast ${folded().has(state.key) ? "-rotate-90" : ""}`}
								/>
								<StatusIcon status={state.key} category={state.category} />
								<span class="truncate font-medium text-body text-fg">{state.name}</span>
								<span class="text-caption text-fg-subtle tabular-nums">
									{inState(state.key).length}
								</span>
							</button>
							<IconButton
								size="xs"
								label={`Add a task to ${state.name}`}
								onClick={() => workspace.openNewTask({ status: state.key })}
							>
								<PlusIcon />
							</IconButton>
						</header>
						<Show when={!folded().has(state.key)}>
							<Show
								when={inState(state.key).length > 0}
								fallback={
									<Text size="caption" tone="faint" class="px-gutter py-3">
										No tasks
									</Text>
								}
							>
								<ul class="divide-y divide-line">
									<For each={inState(state.key)}>
										{(task) => <Row task={task} states={props.states} />}
									</For>
								</ul>
							</Show>
						</Show>
					</section>
				)}
			</For>
		</div>
	);
}

/** One task: its status (a menu to change it), then a link to the task with its facts. */
function Row(props: { task: Task; states: readonly WorkflowState[] }): JSX.Element {
	const workspace = useWorkspace();
	const auth = useAuth();
	const location = useLocation();
	const state = () => props.states.find((item) => item.key === props.task.status);

	async function move(status: string): Promise<void> {
		const token = auth.token();
		const slug = workspace.activeSlug();
		if (!token || !slug || status === props.task.status) return;
		try {
			await projectsService.updateTask(token, slug, props.task.number, {
				status,
				position: nextPosition(workspace.tasks(), status),
			});
			workspace.refreshTasks();
		} catch (cause) {
			notify({
				title: `Couldn't move ${props.task.key}: ${cause instanceof Error ? cause.message : "it was refused"}`,
				tone: "danger",
			});
		}
	}

	return (
		<li class="flex h-11 min-w-0 items-center gap-1 px-gutter transition-colors duration-fast hover:bg-fill pointer-coarse:h-13">
			<Menu
				label={`Status of ${props.task.key}: ${state()?.name ?? props.task.status}`}
				trigger={<StatusIcon status={props.task.status} category={state()?.category} />}
				triggerClass={iconButton({ size: "sm" })}
				placement="bottom-start"
				groups={[
					{
						label: "Move to",
						items: workspace
							.workflow()
							.filter((item) => !item.hidden && item.key !== props.task.status)
							.map((item) => ({
								id: item.key,
								label: item.name,
								icon: <StatusIcon status={item.key} category={item.category} />,
							})),
					},
				]}
				onSelect={(id) => void move(id)}
			/>
			<a
				href={workspaceHref(
					`/board/${workspace.activeSlug()}/tasks/${props.task.number}${location.search}`,
				)}
				class="focus-ring flex h-full min-w-0 flex-1 items-center gap-3"
			>
				<span class="hidden w-16 shrink-0 font-mono text-caption text-fg-subtle sm:block">
					{props.task.key}
				</span>
				<span class="min-w-0 flex-1 truncate text-body text-fg">{props.task.title}</span>
				<Show when={props.task.owner}>
					<OwnerMark task={props.task} />
				</Show>
				<span class="hidden w-14 shrink-0 text-right text-caption text-fg-subtle tabular-nums md:block">
					{relativeTime(props.task.updatedAt)}
				</span>
			</a>
		</li>
	);
}
