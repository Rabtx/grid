import type { JSX } from "@solidjs/web";
import { createEffect, For } from "solid-js";

import { boardLaneId, type BoardLane } from "./board-lanes";

export function StageTabs(props: {
	lanes: BoardLane[];
	active: string;
	onSelect: (laneId: string) => void;
}): JSX.Element {
	const tabs: HTMLButtonElement[] = [];

	createEffect(
		() => [props.active, props.lanes.findIndex((lane) => lane.id === props.active)] as const,
		([, index]) => {
			if (index >= 0) tabs[index]?.scrollIntoView({ block: "nearest", inline: "nearest" });
		},
	);

	return (
		<nav
			aria-label="Board lanes"
			class="-mx-4 mb-1 overflow-x-auto px-4 [scrollbar-width:none] md:hidden"
		>
			<div class="flex w-max gap-1">
				<For each={props.lanes} keyed={false}>
					{(lane, index) => (
						<button
							type="button"
							ref={(el) => {
								tabs[index] = el;
							}}
							aria-controls={boardLaneId(lane().id)}
							aria-current={props.active === lane().id ? "true" : undefined}
							onClick={() => props.onSelect(lane().id)}
							class="focus-ring flex h-row shrink-0 items-center gap-1.5 rounded-md px-2.5 text-ink/55 text-ui-sm transition-colors duration-fast ease-out-grid aria-[current=true]:bg-selection aria-[current=true]:font-medium aria-[current=true]:text-ink"
						>
							{lane().icon()}
							{lane().title}
							<span data-count class="text-ink/40 text-ui-xs tabular-nums">
								{String(lane().tasks.length)}
							</span>
						</button>
					)}
				</For>
			</div>
		</nav>
	);
}
