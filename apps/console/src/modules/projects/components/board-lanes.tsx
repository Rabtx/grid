import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";

import { TaskCard } from "./task-card";
import {
	TASK_STATUSES,
	TASK_STATUS_LABELS,
	type Task,
	type TaskStatus,
} from "../types/project.types";

interface BoardLanesProps {
	columns: Record<TaskStatus, Task[]>;
	lanesContainerRef: { current: HTMLDivElement | null };
}

export function BoardLanes(props: BoardLanesProps): JSX.Element {
	return (
		<div
			ref={(el) => {
				props.lanesContainerRef.current = el;
			}}
			id="lanes-container"
			class="flex snap-x snap-mandatory overflow-x-auto gap-3 md:snap-none scroll-smooth motion-reduce:scroll-auto"
			role="tabpanel"
			aria-label="Workflow lanes"
		>
			<For each={TASK_STATUSES}>
				{(status) => (
					<section
						id={`lane-${status}`}
						aria-labelledby={`lane-${status}-heading`}
						class="w-full shrink-0 snap-start md:w-72"
					>
						<header class="flex items-center justify-between gap-2 px-1">
							<h2
								id={`lane-${status}-heading`}
								class="flex items-center gap-1.5 font-medium text-ui-sm"
							>
								<span
									class="size-2 rounded-full"
									style={{ background: `var(--color-status-${status})` }}
									aria-hidden="true"
								/>
								{TASK_STATUS_LABELS[status]}
							</h2>
							<span class="font-mono text-ui-xs text-muted-foreground">
								{props.columns[status].length}
							</span>
						</header>
						<div class="flex flex-col gap-2 rounded-lg bg-muted p-2">
							<Show
								when={props.columns[status].length > 0}
								fallback={<p class="px-1 py-2 text-ui-sm text-muted-foreground">No tasks</p>}
							>
								<For each={props.columns[status]}>{(task) => <TaskCard task={task} />}</For>
							</Show>
						</div>
					</section>
				)}
			</For>
		</div>
	);
}

interface SkeletonLanesProps {
	isMobile: boolean;
}

export function SkeletonLanes(props: SkeletonLanesProps): JSX.Element {
	const laneCount = 4;

	return (
		<div class="flex snap-x snap-mandatory overflow-x-auto gap-3 md:snap-none">
			{Array.from({ length: laneCount }, (_, i) => (
				<section class="w-full shrink-0 snap-start md:w-72">
					<div class="h-6 animate-pulse motion-reduce:animate-none bg-muted rounded mb-2" />
					<div class="h-32 animate-pulse motion-reduce:animate-none bg-muted rounded" />
					{!props.isMobile && i < laneCount - 1 && (
						<div class="hidden md:block w-full h-32 animate-pulse motion-reduce:animate-none bg-muted rounded" />
					)}
				</section>
			))}
		</div>
	);
}
