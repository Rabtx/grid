import type { JSX } from "@solidjs/web";
import { createEffect, onSettled } from "solid-js";

import { attachEdgeFade, IconButton, PlusIcon, Segmented } from "@/kit";

import { boardLaneId, type BoardLane } from "./board-lanes";

/**
 * Phones see one lane at a time; these tabs name them and jump between them, and the + after them
 * adds a status (the board by status).
 */
export function StageTabs(props: {
	lanes: BoardLane[];
	active: string;
	onSelect: (laneId: string) => void;
	onAdd?: () => void;
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
			class="edge-fade -mx-gutter mb-2 flex shrink-0 items-center gap-1 overflow-x-auto px-gutter [scrollbar-width:none] md:hidden"
		>
			{/* Its own width, so the row scrolls rather than squeezing the tabs under the +. */}
			<div class="shrink-0">
				<Segmented
					label="Board lanes"
					value={props.active}
					onChange={props.onSelect}
					options={props.lanes.map((lane) => ({
						value: lane.id,
						label: lane.short,
						icon: lane.icon(),
						count: lane.tasks.length,
						countTone: "quiet",
						controls: boardLaneId(lane.id),
					}))}
				/>
			</div>
			{props.onAdd ? (
				<IconButton size="sm" label="Add a status" onClick={() => props.onAdd?.()}>
					<PlusIcon />
				</IconButton>
			) : null}
		</nav>
	);
}
