import type { JSX } from "@solidjs/web";
import { createEffect, onSettled } from "solid-js";

import { attachEdgeFade, Segmented } from "@/kit";

import { boardLaneId, type BoardLane } from "./board-lanes";

/** Phones see one lane at a time; these tabs name them and jump between them. */
export function StageTabs(props: {
	lanes: BoardLane[];
	active: string;
	onSelect: (laneId: string) => void;
}): JSX.Element {
	let strip: HTMLElement | undefined;
	onSettled(() => (strip ? attachEdgeFade(strip) : undefined));

	createEffect(
		() => props.active,
		(active) => {
			strip
				?.querySelector(`[aria-controls="${boardLaneId(active)}"]`)
				?.scrollIntoView({ block: "nearest", inline: "nearest" });
		},
	);

	return (
		<nav
			ref={(el) => {
				strip = el;
			}}
			aria-label="Board lanes"
			class="edge-fade -mx-4 mb-2 shrink-0 overflow-x-auto px-4 [scrollbar-width:none] md:hidden"
		>
			<Segmented
				label="Board lanes"
				value={props.active}
				onChange={props.onSelect}
				options={props.lanes.map((lane) => ({
					value: lane.id,
					label: lane.title,
					icon: lane.icon(),
					count: lane.tasks.length,
					countTone: "quiet",
					controls: boardLaneId(lane.id),
				}))}
			/>
		</nav>
	);
}
