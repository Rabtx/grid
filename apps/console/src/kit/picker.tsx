import type { JSX } from "@solidjs/web";
import { For, onSettled, Show } from "solid-js";

import { attachEdgeFade } from "./edge-fade";

import { CheckIcon, StarIcon } from "./icons";

export type AgentChoice = {
	id: string;
	name: string;
	/** Who makes it, where it runs: "Anthropic", "Any provider". */
	detail?: string;
	logo: JSX.Element;
};

/**
 * Which agent a thread is for (Figma 10 · Composer, Model picker): rows with the agent's logo in
 * a tile and a line about it, the chosen one lit and checked, from md; a row of pills across the
 * sheet on phones.
 */
export function AgentChoices(props: {
	label: string;
	items: readonly AgentChoice[];
	value: string;
	onChange: (id: string) => void;
}): JSX.Element {
	let row: HTMLDivElement | undefined;
	onSettled(() => (row ? attachEdgeFade(row) : undefined));
	return (
		// oxlint-disable-next-line jsx-a11y/interactive-supports-focus -- focus sits on its radios, one tab stop among them
		<div
			ref={(el) => {
				row = el;
			}}
			role="radiogroup"
			aria-label={props.label}
			onKeyDown={(event) => {
				// A radio group: one tab stop, the arrows move the choice.
				const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
				if (!step || props.items.length === 0) return;
				event.preventDefault();
				const at = Math.max(
					0,
					props.items.findIndex((item) => item.id === props.value),
				);
				const next = props.items[(at + step + props.items.length) % props.items.length];
				props.onChange(next.id);
				requestAnimationFrame(() =>
					row?.querySelector<HTMLElement>(`[data-agent="${next.id}"]`)?.focus(),
				);
			}}
			class="edge-fade flex gap-2 overflow-x-auto [scrollbar-width:none] md:flex-col md:gap-0.5 md:overflow-visible"
		>
			<For each={props.items}>
				{(item) => (
					<button
						type="button"
						// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a radio input cannot hold a logo and a second line
						role="radio"
						data-agent={item.id}
						tabindex={props.value === item.id ? 0 : -1}
						aria-checked={props.value === item.id ? "true" : "false"}
						onClick={() => props.onChange(item.id)}
						class="surface-outline focus-ring flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-body-lg text-fg transition-colors duration-fast hover:bg-fill aria-checked:bg-fill-strong aria-checked:shadow-none md:h-auto md:min-h-12 md:gap-3 md:rounded-kit-lg md:px-2 md:py-1.5 md:bg-transparent md:text-body md:shadow-none md:hover:bg-fill md:aria-checked:bg-fill"
					>
						<span class="grid shrink-0 place-items-center md:size-8 md:rounded-kit-md md:icon-tile">
							{item.logo}
						</span>
						<span class="flex min-w-0 flex-col text-left md:flex-1">
							<span class="truncate">{item.name}</span>
							<Show when={item.detail}>
								<span class="hidden truncate text-caption text-fg-subtle md:block">
									{item.detail}
								</span>
							</Show>
						</span>
						<CheckIcon
							size="sm"
							class={`hidden shrink-0 text-fg ${props.value === item.id ? "md:block" : ""}`}
						/>
					</button>
				)}
			</For>
		</div>
	);
}

/**
 * A model in a picker (Figma 10 · Composer, Model picker): a tile, its name and a line about it,
 * the chosen one lit — checked from md, a filled radio on phones. A shortcut or a badge may sit on
 * the right. The star marks a favourite; it shows on hover for pointers, always on touch, and
 * is a button of its own.
 */
export function ModelRow(props: {
	name: string;
	description?: string;
	/** On hover: the model's id, for when the name is not enough. */
	title?: string;
	/** In the tile on the left. */
	icon?: JSX.Element;
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
			class={`group/model relative flex min-w-0 items-center rounded-kit-lg transition-colors duration-fast ${props.selected || props.active ? "bg-fill" : "hover:bg-fill"}`}
		>
			<button
				type="button"
				aria-label={props.name}
				title={props.title}
				aria-pressed={props.selected ? "true" : "false"}
				onMouseEnter={() => props.onHover?.()}
				onClick={(event) => props.onPick(event)}
				class="focus-ring flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-kit-lg py-1.5 pr-16 pl-2 text-left pointer-coarse:min-h-14"
			>
				<span
					class={`grid size-8 shrink-0 place-items-center rounded-kit-md ${props.selected ? "tint-warning" : "icon-tile text-fg-muted"}`}
				>
					{props.icon}
				</span>
				<span class="flex min-w-0 flex-1 flex-col">
					<span class="flex min-w-0 items-center gap-1.5">
						<span class="truncate text-body text-fg">{props.name}</span>
						{props.badge}
					</span>
					<Show when={props.description}>
						<span class="truncate text-caption text-fg-subtle">{props.description}</span>
					</Show>
				</span>
			</button>
			<span class="pointer-events-none absolute right-2 flex items-center gap-1">
				<Show when={props.detail}>
					<span class="text-caption text-fg-faint">{props.detail}</span>
				</Show>
				<Show when={props.selected}>
					<CheckIcon size="sm" class="hidden text-fg md:block" />
				</Show>
				<span
					aria-hidden="true"
					class={`grid size-5 place-items-center rounded-full md:hidden ${props.selected ? "bg-accent" : "ring-line-strong"}`}
				>
					<Show when={props.selected}>
						<span class="size-2 rounded-full bg-white" />
					</Show>
				</span>
			</span>
			<button
				type="button"
				aria-label={
					props.favorite
						? `Remove ${props.name} from favourites`
						: `Add ${props.name} to favourites`
				}
				aria-pressed={props.favorite ? "true" : "false"}
				onClick={() => props.onFavorite()}
				class={`focus-ring absolute right-8 grid size-7 place-items-center rounded-kit-sm transition-opacity duration-fast hover:bg-fill-strong aria-pressed:text-warning ${props.favorite ? "" : "text-fg-faint opacity-0 group-hover/model:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"}`}
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
