import type { JSX } from "@solidjs/web";
import { createSignal, isPending, Loading, Show, Errored } from "solid-js";

import { useWorkspace } from "../context/workspace-context";
import { groupByStatus } from "../lib/board";
import { type TaskStatus } from "../types/project.types";

import { StageTabs } from "./stage-tabs";
import { BoardLanes, SkeletonLanes } from "./board-lanes";

export function BoardScreen(): JSX.Element {
	const workspace = useWorkspace();
	const [activeStatus, setActiveStatus] = createSignal<TaskStatus>("backlog");
	const lanesContainerRef = { current: null as HTMLDivElement | null };

	return (
		<Loading fallback={<SkeletonLanes isMobile={true} />}>
			<Show when={workspace.activeProject()} fallback={<ProjectNotFound />}>
				<Errored
					fallback={(err, reset) => (
						<div class="space-y-3 py-8 text-center">
							<p class="text-ui text-destructive" role="alert">
								{(err() as Error).message}
							</p>
							<button
								class="min-h-row px-4 rounded-md bg-primary text-primary-foreground text-ui font-medium"
								onClick={reset}
							>
								Try again
							</button>
						</div>
					)}
				>
					{isPending(() => workspace.tasks()) && (
						<div
							class="h-0.5 bg-primary animate-pulse fixed top-14 left-0 right-0 z-10"
							aria-hidden="true"
						/>
					)}
					<div class="lg:hidden px-4 py-2 text-ui-sm text-muted-foreground">
						{workspace.tasks().length} tasks
					</div>
					<StageTabs
						columns={groupByStatus(workspace.tasks())}
						activeStatus={activeStatus()}
						setActiveStatus={setActiveStatus}
					/>
					<BoardLanes
						columns={groupByStatus(workspace.tasks())}
						lanesContainerRef={lanesContainerRef}
					/>
				</Errored>
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
