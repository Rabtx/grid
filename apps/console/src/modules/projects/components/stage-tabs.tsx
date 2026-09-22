import type { JSX } from "@solidjs/web";
import { createEffect, For } from "solid-js";

import { laneId, STATUS_DOT_CLASS } from "../lib/stage-style";
import {
	TASK_STATUS_LABELS,
	TASK_STATUSES,
	type Task,
	type TaskStatus,
} from "../types/project.types";

/**
 * Phone-only stage switcher above the swipeable lanes. Tapping a stage scrolls its lane in;
 * swiping updates `active`, and the active stage is kept in view in this row.
 */
export function StageTabs(props: {
	columns: Record<TaskStatus, Task[]>;
	active: TaskStatus;
	onSelect: (status: TaskStatus) => void;
}): JSX.Element {
	const tabs = new Map<TaskStatus, HTMLButtonElement>();

	createEffect(
		() => props.active,
		(status) => {
			// Block body on purpose: newer browsers return a promise from scrollIntoView, and an
			// effect's return value is treated as its cleanup.
			tabs.get(status)?.scrollIntoView({ block: "nearest", inline: "nearest" });
		},
	);

	return (
		<nav
			aria-label="Stages"
			class="-mx-4 mb-3 overflow-x-auto px-4 [scrollbar-width:none] md:hidden"
		>
			<div class="flex w-max gap-1.5">
				<For each={TASK_STATUSES}>
					{(status) => (
						<button
							type="button"
							ref={(el) => {
								tabs.set(status, el);
							}}
							aria-controls={laneId(status)}
							aria-current={props.active === status ? "true" : undefined}
							onClick={() => props.onSelect(status)}
							class="flex min-h-row shrink-0 items-center gap-2 rounded-full border border-border px-3 text-ui-sm transition-colors duration-fast ease-out-grid aria-[current=true]:border-transparent aria-[current=true]:bg-accent aria-[current=true]:font-medium"
						>
							<span class={`size-2 rounded-full ${STATUS_DOT_CLASS[status]}`} aria-hidden="true" />
							{TASK_STATUS_LABELS[status]}
							<span class="font-mono text-muted-foreground text-ui-xs">
								{props.columns[status].length}
							</span>
						</button>
					)}
				</For>
			</div>
		</nav>
	);
}
