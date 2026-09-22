import type { JSX } from "@solidjs/web";
import { For, onSettled, Show } from "solid-js";

import { laneId, STATUS_DOT_CLASS } from "../lib/stage-style";
import {
	TASK_STATUS_LABELS,
	TASK_STATUSES,
	type Task,
	type TaskStatus,
} from "../types/project.types";

import { TaskCard } from "./task-card";

/**
 * Every stage as a lane in one scroller. Phones see one full-width lane at a time and swipe
 * between them (scroll snap); from `md:` the same lanes sit side by side as columns.
 */
export function BoardLanes(props: {
	columns: Record<TaskStatus, Task[]>;
	onActiveChange: (status: TaskStatus) => void;
}): JSX.Element {
	let scroller: HTMLDivElement | undefined;

	onSettled(() => {
		if (!scroller) return;
		const observer = new IntersectionObserver(
			(entries) => {
				const visible = entries.find((entry) => entry.isIntersecting);
				const status = visible?.target.getAttribute("data-status") as TaskStatus | null;
				if (status) props.onActiveChange(status);
			},
			{ root: scroller, threshold: 0.6 },
		);
		for (const lane of scroller.querySelectorAll("[data-status]")) observer.observe(lane);
		return () => observer.disconnect();
	});

	return (
		<div
			ref={(el) => {
				scroller = el;
			}}
			class="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 [scrollbar-width:none] md:[scrollbar-width:auto] motion-safe:scroll-smooth md:-mx-6 md:snap-none md:scroll-px-6 md:px-6 lg:-mx-8 lg:px-8"
		>
			<For each={TASK_STATUSES}>
				{(status) => (
					<section
						id={laneId(status)}
						data-status={status}
						aria-labelledby={`${laneId(status)}-title`}
						class="flex w-full shrink-0 snap-start flex-col gap-2 md:w-72"
					>
						<header class="flex items-center justify-between gap-2 px-1">
							<h2
								id={`${laneId(status)}-title`}
								class="flex items-center gap-2 font-medium text-ui-sm"
							>
								<span
									class={`size-2 rounded-full ${STATUS_DOT_CLASS[status]}`}
									aria-hidden="true"
								/>
								{TASK_STATUS_LABELS[status]}
							</h2>
							<span class="font-mono text-muted-foreground text-ui-xs">
								{props.columns[status].length}
							</span>
						</header>
						<div class="flex flex-col gap-2 rounded-lg bg-muted p-2">
							<Show
								when={props.columns[status].length > 0}
								fallback={<p class="px-1 py-2 text-muted-foreground text-ui-sm">No tasks</p>}
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

/** First-load placeholder: one lane on phones, four columns from `md:`. */
export function SkeletonLanes(): JSX.Element {
	return (
		<div class="flex gap-3" aria-hidden="true">
			<For each={[0, 1, 2, 3]}>
				{(index) => (
					<div class={`w-full shrink-0 space-y-2 md:w-72 ${index === 0 ? "" : "hidden md:block"}`}>
						<div class="h-5 w-24 animate-pulse rounded bg-muted motion-reduce:animate-none" />
						<div class="h-40 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
					</div>
				)}
			</For>
		</div>
	);
}
