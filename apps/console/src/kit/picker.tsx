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
	/** It needs something before it can work (signing in): a small warning dot on its chip. */
	attention?: boolean;
};

/**
 * Which agent a thread is for: a row of chips across the top of the model picker, each its logo
 * and name, the chosen one filled. It scrolls sideways and fades at the end with more. One tab
 * stop; the arrows move the choice.
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
			class="edge-fade flex gap-1 overflow-x-auto [scrollbar-width:none]"
		>
			<For each={props.items}>
				{(item) => (
					<button
						type="button"
						// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a radio input cannot hold a logo and a second line
						role="radio"
						data-agent={item.id}
						tabindex={props.value === item.id ? 0 : -1}
						aria-label={item.name}
						title={[item.name, item.detail].filter(Boolean).join(" · ")}
						aria-checked={props.value === item.id ? "true" : "false"}
						onClick={() => props.onChange(item.id)}
						class="focus-ring relative flex h-control shrink-0 items-center gap-1.5 rounded-pill pr-3 pl-2 text-ui-sm text-fg-muted transition-colors duration-fast hover:bg-fill hover:text-fg aria-checked:bg-fill-strong aria-checked:font-medium aria-checked:text-fg"
					>
						<span class="grid size-4 shrink-0 place-items-center">{item.logo}</span>
						<span class="truncate">{item.name}</span>
						<Show when={item.detail}>
							<span class="sr-only">{item.detail}</span>
						</Show>
						<Show when={item.attention}>
							<span
								aria-hidden="true"
								class="absolute top-1 right-1 size-1.5 rounded-full bg-warning"
							/>
						</Show>
					</button>
				)}
			</For>
		</div>
	);
}

/**
 * A model in a picker: one quiet line — its name in full ink, a note after it in secondary ink,
 * and on the right what tells models apart (free, context size) and a check on the chosen one.
 * The chosen row and the keyboard's row are filled. The star, in a slot at the start so names
 * line up, marks a favourite: shown on hover for pointers, faintly on touch, and kept once starred.
 */
export function ModelRow(props: {
	name: string;
	description?: string;
	/** On hover: the model's id, for when the name is not enough. */
	title?: string;
	/** Before the name, when the list mixes kinds of thing. */
	icon?: JSX.Element;
	badge?: JSX.Element;
	/** On the right, before the check: free, context size. */
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
			class={`group/model relative flex min-w-0 items-center rounded-kit-md transition-colors duration-fast ${props.selected ? "bg-selection" : props.active ? "bg-fill" : "hover:bg-fill"}`}
		>
			<button
				type="button"
				aria-label={props.name}
				title={props.title}
				aria-pressed={props.selected ? "true" : "false"}
				onMouseEnter={() => props.onHover?.()}
				onClick={(event) => props.onPick(event)}
				class="focus-ring flex h-row min-w-0 flex-1 items-center gap-2 rounded-kit-md pr-2 pl-8 text-left"
			>
				<Show when={props.icon}>
					<span class="grid shrink-0 place-items-center text-fg-subtle">{props.icon}</span>
				</Show>
				<span class="flex min-w-0 flex-1 items-baseline gap-2">
					<span
						class={`shrink-0 truncate text-ui ${props.selected ? "font-medium text-fg" : "text-fg"}`}
					>
						{props.name}
					</span>
					{props.badge}
					<Show when={props.description}>
						<span class="min-w-0 truncate text-ui-xs text-fg-subtle">{props.description}</span>
					</Show>
				</span>
				<span class="flex shrink-0 items-center gap-2 pl-4">
					<Show when={props.detail}>
						<span class="flex items-center gap-1.5 text-ui-xs text-fg-faint tabular-nums">
							{props.detail}
						</span>
					</Show>
					<span class="grid size-4 place-items-center text-accent">
						<Show when={props.selected}>
							<CheckIcon size="sm" />
						</Show>
					</span>
				</span>
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
				class={`focus-ring absolute left-1 grid size-6 place-items-center rounded-kit-sm transition-opacity duration-fast hover:bg-fill-strong aria-pressed:text-warning ${props.favorite ? "" : "text-fg-faint opacity-0 group-hover/model:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-50"}`}
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
