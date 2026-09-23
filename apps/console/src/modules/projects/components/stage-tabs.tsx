import type { JSX } from "@solidjs/web";
import { createEffect, For } from "solid-js";

import { laneId } from "../lib/stage-style";
import {
	TASK_STATUS_LABELS,
	TASK_STATUSES,
	type Task,
	type TaskStatus,
} from "../types/project.types";

import { StatusIcon } from "./status-icon";

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
			class="-mx-4 mb-1 overflow-x-auto px-4 [scrollbar-width:none] md:hidden"
		>
			<div class="flex w-max gap-1">
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
							class="focus-ring flex h-row shrink-0 items-center gap-1.5 rounded-md px-2.5 text-ink/55 text-ui-sm transition-colors duration-fast ease-out-grid aria-[current=true]:bg-selection aria-[current=true]:font-medium aria-[current=true]:text-ink"
						>
							<StatusIcon status={status} />
							{TASK_STATUS_LABELS[status]}
							<span data-count class="text-ink/40 text-ui-xs tabular-nums">
								{props.columns[status].length}
							</span>
						</button>
					)}
				</For>
			</div>
		</nav>
	);
}
