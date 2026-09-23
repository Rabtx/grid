import type { JSX } from "@solidjs/web";
import { For, onSettled, Show } from "solid-js";

import { Skeleton } from "@/ui";

import { laneId } from "../lib/stage-style";
import {
	TASK_STATUS_LABELS,
	TASK_STATUSES,
	type Task,
	type TaskStatus,
} from "../types/project.types";

import { StatusIcon } from "./status-icon";
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
			class="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-4 [scrollbar-width:none] motion-safe:scroll-smooth md:-mx-6 md:snap-none md:scroll-px-6 md:px-6 md:[scrollbar-width:thin] lg:-mx-4 lg:px-4"
		>
			<For each={TASK_STATUSES}>
				{(status) => (
					<section
						id={laneId(status)}
						data-status={status}
						aria-labelledby={`${laneId(status)}-title`}
						class="flex w-full shrink-0 snap-start flex-col md:w-[17.75rem]"
					>
						<header class="flex h-9 items-center gap-2 px-1">
							<StatusIcon status={status} />
							<h2 id={`${laneId(status)}-title`} class="font-medium text-ink/80 text-ui-sm">
								{TASK_STATUS_LABELS[status]}
							</h2>
							<span data-count class="text-ink/40 text-ui-xs tabular-nums">
								{props.columns[status].length}
							</span>
						</header>
						<div class="flex flex-col gap-2 p-0.5">
							<Show
								when={props.columns[status].length > 0}
								fallback={
									<p class="grid h-20 place-items-center rounded-lg border border-ink/10 border-dashed text-ink/35 text-ui-sm">
										No tasks
									</p>
								}
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
