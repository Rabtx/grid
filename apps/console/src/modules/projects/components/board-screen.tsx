import type { JSX } from "@solidjs/web";
import { createMemo, createSignal, Errored, isPending, Loading, Show } from "solid-js";

import { useWorkspace } from "../context/workspace-context";
import { groupByStatus } from "../lib/board";
import { laneId } from "../lib/stage-style";
import type { TaskStatus } from "../types/project.types";

import { BoardLanes, SkeletonLanes } from "./board-lanes";
import { StageTabs } from "./stage-tabs";

export function BoardScreen(): JSX.Element {
	return (
		<Loading fallback={<SkeletonLanes />}>
			<Errored fallback={(error, reset) => <BoardError error={error()} onRetry={reset} />}>
				<Board />
			</Errored>
		</Loading>
	);
}

function Board(): JSX.Element {
	const workspace = useWorkspace();
	const columns = createMemo(() => groupByStatus(workspace.tasks()));
	const [active, setActive] = createSignal<TaskStatus>("backlog");
	const count = createMemo(() => workspace.tasks().length);

	function select(status: TaskStatus) {
		setActive(status);
		document
			.getElementById(laneId(status))
			?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
	}

	return (
		<Show when={workspace.activeProject()} fallback={<ProjectNotFound />}>
			{/* Always in the layout so switching projects never shifts the board. */}
			<div
				aria-hidden="true"
				class={`-mt-2 mb-2 h-0.5 rounded-full ${isPending(() => workspace.tasks()) ? "animate-pulse bg-primary" : "bg-transparent"}`}
			/>
			<p class="mb-3 text-muted-foreground text-ui-sm lg:hidden">
				{count()} task{count() === 1 ? "" : "s"}
			</p>
			<StageTabs columns={columns()} active={active()} onSelect={select} />
			<BoardLanes columns={columns()} onActiveChange={setActive} />
		</Show>
	);
}

function BoardError(props: { error: unknown; onRetry: () => void }): JSX.Element {
	return (
		<div role="alert" class="space-y-3 py-8">
			<h1 class="font-semibold text-title">The board could not load</h1>
			<p class="text-muted-foreground text-ui">
				{props.error instanceof Error ? props.error.message : "Something went wrong."}
			</p>
			<button
				type="button"
				onClick={() => props.onRetry()}
				class="h-control rounded-md bg-primary px-3 font-medium text-primary-foreground text-ui"
			>
				Try again
			</button>
		</div>
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
