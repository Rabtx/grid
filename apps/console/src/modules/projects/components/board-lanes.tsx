import type { JSX } from "@solidjs/web";
import { createEffect, For, onSettled, Show } from "solid-js";

import { Skeleton } from "@/ui";

import type { Task } from "../types/project.types";

import { TaskCard } from "./task-card";

export type BoardLane = {
	id: string;
	title: string;
	icon: JSX.Element;
	tasks: Task[];
};

export function boardLaneId(id: string): string {
	return `lane-${id}`;
}

export function BoardLanes(props: {
	lanes: BoardLane[];
	onActiveChange: (laneId: string) => void;
}): JSX.Element {
	let scroller: HTMLDivElement | undefined;
	let observer: IntersectionObserver | undefined;

	function observeCurrentLanes(): void {
		if (!scroller || !observer) return;
		observer.disconnect();
		for (const lane of scroller.querySelectorAll<HTMLElement>("[data-lane]")) {
			observer.observe(lane);
		}
	}

	onSettled(() => {
		observer = new IntersectionObserver(
			(entries) => {
				const visible = entries.find((entry) => entry.isIntersecting);
				const lane = visible?.target.getAttribute("data-lane");
				if (lane) props.onActiveChange(lane);
			},
			{ root: scroller, threshold: 0.6 },
		);
		observeCurrentLanes();
		return () => {
			observer?.disconnect();
			observer = undefined;
		};
	});

	createEffect(() => props.lanes.map((lane) => lane.id).join("|"), observeCurrentLanes);

	return (
		<div
			ref={(el) => {
				scroller = el;
			}}
			class="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-4 [scrollbar-width:none] motion-safe:scroll-smooth md:-mx-6 md:snap-none md:scroll-px-6 md:px-6 md:[scrollbar-width:thin] lg:-mx-4 lg:px-4"
		>
			<For each={props.lanes} keyed={false}>
				{(lane) => (
					<section
						id={boardLaneId(lane().id)}
						data-lane={lane().id}
						aria-labelledby={`${boardLaneId(lane().id)}-title`}
						class="flex w-full shrink-0 snap-start flex-col md:w-[17.75rem]"
					>
						<header class="flex h-9 items-center gap-2 px-1">
							{lane().icon}
							<h2 id={`${boardLaneId(lane().id)}-title`} class="font-medium text-ink/80 text-ui-sm">
								{lane().title}
							</h2>
							<span data-count class="text-ink/40 text-ui-xs tabular-nums">
								{lane().tasks.length}
							</span>
						</header>
						<div class="flex flex-col gap-2 p-0.5">
							<Show
								when={lane().tasks.length > 0}
								fallback={
									<p class="grid h-20 place-items-center rounded-lg border border-ink/10 border-dashed text-ink/35 text-ui-sm">
										No tasks
									</p>
								}
							>
								<For each={lane().tasks}>{(task) => <TaskCard task={task} />}</For>
							</Show>
						</div>
					</section>
				)}
			</For>
		</div>
	);
}

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
