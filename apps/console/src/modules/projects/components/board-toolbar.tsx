import type { JSX } from "@solidjs/web";
import { For } from "solid-js";

import { Input, SearchIcon, SegmentedControl } from "@/ui";

import type { OwnerOption } from "../lib/board";

const VIEW_OPTIONS = [
	{ value: "status", label: "By status" },
	{ value: "owner", label: "By owner" },
] as const;

export type BoardView = "status" | "owner";

export function BoardToolbar(props: {
	view: BoardView;
	onViewChange: (view: BoardView) => void;
	query: string;
	onQueryChange: (query: string) => void;
	owner: string;
	ownerOptions: readonly OwnerOption[];
	onOwnerChange: (owner: string) => void;
}): JSX.Element {
	return (
		<div class="mb-3 grid grid-cols-[minmax(9.75rem,1fr)_minmax(7rem,0.8fr)] items-center gap-2 md:flex md:justify-between">
			<div class="col-start-1 row-start-2 min-w-0 whitespace-nowrap md:order-1">
				<SegmentedControl
					label="Board view"
					options={VIEW_OPTIONS}
					value={props.view}
					onChange={props.onViewChange}
				/>
			</div>
			<select
				aria-label="Filter by owner"
				value={props.owner}
				onChange={(event) => props.onOwnerChange(event.currentTarget.value)}
				class="col-start-2 row-start-2 h-field w-full min-w-0 rounded-md border border-ink/12 bg-canvas/40 px-2.5 text-ink text-ui-input outline-none transition-colors duration-fast ease-out-grid hover:border-ink/20 focus:border-ink/30 md:order-2 md:w-40"
			>
				<For each={props.ownerOptions}>
					{(option) => <option value={option.value}>{option.label}</option>}
				</For>
			</select>
			<div class="col-span-2 row-start-1 min-w-0 md:order-3 md:w-60">
				<div class="relative">
					<SearchIcon class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink/40" />
					<Input
						type="search"
						enterkeyhint="search"
						aria-label="Filter tasks"
						placeholder="Filter tasks"
						value={props.query}
						onInput={(event) => props.onQueryChange(event.currentTarget.value)}
						class="pl-9"
					/>
				</div>
			</div>
		</div>
	);
}
