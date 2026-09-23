import type { JSX } from "@solidjs/web";
import { createMemo, createSignal, Errored, isPending, Loading, Show } from "solid-js";

import { Button, EmptyState, ErrorNotice } from "@/ui";

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
				class={`-mt-1 mb-2 h-0.5 rounded-full ${isPending(() => workspace.tasks()) ? "animate-pulse bg-accent" : "bg-transparent"}`}
			/>
			<p class="mb-2 text-ink/45 text-ui-sm tabular-nums lg:hidden">
				{count()} task{count() === 1 ? "" : "s"}
			</p>
			<StageTabs columns={columns()} active={active()} onSelect={select} />
			<BoardLanes columns={columns()} onActiveChange={setActive} />
		</Show>
	);
}

function BoardError(props: { error: unknown; onRetry: () => void }): JSX.Element {
	return (
		<div class="py-6">
			<ErrorNotice
				message={`The board could not load: ${props.error instanceof Error ? props.error.message : "something went wrong"}.`}
				action={
					<Button size="sm" variant="secondary" onClick={() => props.onRetry()}>
						Try again
					</Button>
				}
			/>
		</div>
	);
}

function ProjectNotFound(): JSX.Element {
	return (
		<EmptyState
			title="Project not found"
			description="It may have been renamed or archived."
			action={
				<a
					href="/board"
					class="focus-ring rounded-sm text-link text-ui-sm underline-offset-2 hover:underline"
				>
					Open your first project
				</a>
			}
		/>
	);
}
