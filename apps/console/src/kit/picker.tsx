import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";

import { StarIcon } from "./icons";

export type RailItem = { id: string; label: string; icon: JSX.Element };

/**
 * What a picker's list shows, chosen from a rail: favourites, then each agent or provider. A
 * named column down the left of the panel from md, a row of chips across its top on phones.
 */
export function ChoiceRail(props: {
	label: string;
	items: readonly RailItem[];
	value: string;
	onChange: (id: string) => void;
}): JSX.Element {
	return (
		<div
			role="tablist"
			aria-label={props.label}
			class="flex shrink-0 gap-1 overflow-x-auto border-line border-b px-2 py-1.5 [scrollbar-width:none] md:w-40 md:flex-col md:overflow-y-auto md:border-r md:border-b-0 md:bg-fill md:p-1.5"
		>
			<For each={props.items}>
				{(item) => (
					<button
						type="button"
						role="tab"
						title={item.label}
						aria-label={item.label}
						aria-selected={props.value === item.id ? "true" : "false"}
						onClick={() => props.onChange(item.id)}
						class="focus-ring flex h-8 shrink-0 items-center gap-2 rounded-kit-md px-2 text-body text-fg-subtle transition-[background-color,color,box-shadow] duration-fast hover:bg-fill-strong hover:text-fg aria-selected:bg-surface-raised aria-selected:text-fg aria-selected:shadow-lift pointer-coarse:h-10 md:w-full"
					>
						<span class="grid size-5 shrink-0 place-items-center">{item.icon}</span>
						<span class="min-w-0 truncate whitespace-nowrap">{item.label}</span>
					</button>
				)}
			</For>
		</div>
	);
}

/**
 * A model in a picker: its name and a line about it, a badge (a flagship's sparkle), a detail
 * on the right (how many efforts), the chosen one lit and checked. The star marks a favourite;
 * it shows on hover for pointers and always on touch, and is a button of its own.
 */
export function ModelRow(props: {
	name: string;
	description?: string;
	/** On hover: the model's id, for when the name is not enough. */
	title?: string;
	badge?: JSX.Element;
	detail?: JSX.Element;
	selected: boolean;
	/** The keyboard is on it. */
	active?: boolean;
	favorite: boolean;
	onFavorite: () => void;
	onPick: (event: MouseEvent) => void;
	onHover?: () => void;
	index?: number;
}): JSX.Element {
	return (
		<div
			data-index={props.index}
			class={`group/model relative flex min-w-0 items-center rounded-kit-md transition-colors duration-fast ${props.selected ? "bg-fill-strong" : props.active ? "bg-fill" : "hover:bg-fill"}`}
		>
			<button
				type="button"
				aria-label={props.name}
				title={props.title}
				aria-pressed={props.selected ? "true" : "false"}
				onMouseEnter={() => props.onHover?.()}
				onClick={(event) => props.onPick(event)}
				class="focus-ring flex min-h-kit-row min-w-0 flex-1 items-center gap-2.5 rounded-kit-md py-1.5 pr-9 pl-2.5 text-left pointer-coarse:min-h-12"
			>
				<span class="flex min-w-0 flex-1 flex-col">
					<span class="flex min-w-0 items-center gap-1.5">
						<span class="truncate text-body-lg text-fg">{props.name}</span>
						{props.badge}
					</span>
					<Show when={props.description}>
						<span class="truncate text-caption text-fg-subtle">{props.description}</span>
					</Show>
				</span>
				<Show when={props.detail}>
					<span class="shrink-0 text-caption text-fg-faint">{props.detail}</span>
				</Show>
			</button>
			<button
				type="button"
				aria-label={
					props.favorite
						? `Remove ${props.name} from favourites`
						: `Add ${props.name} to favourites`
				}
				aria-pressed={props.favorite ? "true" : "false"}
				onClick={() => props.onFavorite()}
				class={`focus-ring absolute right-1.5 grid size-7 place-items-center rounded-kit-sm transition-opacity duration-fast hover:bg-fill-strong aria-pressed:text-warning aria-pressed:opacity-100 pointer-coarse:opacity-100 ${props.favorite ? "" : "text-fg-faint opacity-0 group-hover/model:opacity-100 focus-visible:opacity-100"}`}
			>
				<StarIcon size="sm" />
			</button>
		</div>
	);
}

/** A flagship model's mark beside its name: a small sparkle in the accent. */
export function FlagshipMark(props: { children?: JSX.Element }): JSX.Element {
	return (
		<span
			title="Flagship model"
			class="inline-flex shrink-0 items-center gap-0.5 rounded-kit-sm bg-accent/12 px-1 text-micro text-accent"
		>
			{props.children ?? "Top"}
		</span>
	);
}
