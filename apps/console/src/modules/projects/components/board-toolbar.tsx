import type { JSX } from "@solidjs/web";

import { Row, SearchIcon, SearchInput, Segmented, Select } from "@/kit";

import type { OwnerOption } from "../lib/board";

export type BoardView = "status" | "owner";

/** The board's controls: group by stage or owner, filter by owner, find a task. */
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
		<Row wrap gap={2} class="mb-3">
			<SearchInput
				icon={<SearchIcon />}
				type="search"
				enterkeyhint="search"
				aria-label="Filter tasks"
				placeholder="Filter tasks"
				value={props.query}
				onInput={(event) => props.onQueryChange(event.currentTarget.value)}
				class="w-full md:order-3 md:w-60"
			/>
			<Segmented
				label="Board view"
				options={[
					{ value: "status", label: "By status" },
					{ value: "owner", label: "By owner" },
				]}
				value={props.view}
				onChange={props.onViewChange}
			/>
			{/* Beside the view on phones, filling what is left; a fixed width from md. */}
			<div class="min-w-0 flex-1 md:order-2 md:ml-auto md:w-40 md:flex-none">
				<Select
					label="Filter by owner"
					value={props.owner}
					onChange={props.onOwnerChange}
					groups={[
						{
							options: props.ownerOptions.map((option) => ({
								value: option.value,
								label: option.label,
							})),
						},
					]}
				/>
			</div>
		</Row>
	);
}
