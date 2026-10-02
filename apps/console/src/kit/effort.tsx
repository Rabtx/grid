import type { JSX } from "@solidjs/web";
import { createSignal, createUniqueId, For, Show } from "solid-js";

import { tap } from "./haptics";

export type EffortLevel = { id: string; name: string };

/** What each level means, in a few words under the slider. */
const MEANING: Record<string, string> = {
	none: "Answers straight away",
	minimal: "Almost instant",
	low: "Quick, light thinking",
	medium: "Balanced",
	high: "Thinks it through",
	xhigh: "Thinks harder",
	max: "Thinks the longest",
	ultra: "As hard as it can",
};

/**
 * How hard the model thinks (Figma 10 · Composer, Model picker): the level and what it means on
 * top; a round track whose lit fill runs from the left to a white knob at the chosen level, with
 * a light sweeping across as it moves and a soft glow at the top level; the level names along the
 * bottom, the chosen one in ink. A native range underneath takes the arrow keys and the screen
 * reader; the names and the track take the tap.
 */
export function EffortSlider(props: {
	label: string;
	levels: readonly EffortLevel[];
	value: string | null;
	onChange: (id: string) => void;
}): JSX.Element {
	const id = createUniqueId();
	const [direction, setDirection] = createSignal<"up" | "down">("up");
	const [moves, setMoves] = createSignal(0);
	const index = () =>
		Math.max(
			0,
			props.levels.findIndex((level) => level.id === props.value),
		);
	const current = () => props.levels[index()];
	const top = () => index() === props.levels.length - 1 && props.levels.length > 1;
	// Where the knob sits along the track, 0 to 1.
	const at = () => (props.levels.length > 1 ? index() / (props.levels.length - 1) : 0);

	function set(next: number): void {
		const level = props.levels[next];
		if (!level || next === index()) return;
		setDirection(next > index() ? "up" : "down");
		setMoves((n) => n + 1);
		props.onChange(level.id);
		tap();
	}

	/** A tap on the track picks the nearest level (a click, so a swipe across it only scrolls). */
	function pickAt(event: MouseEvent): void {
		const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
		const ratio = Math.min(1, Math.max(0, (event.clientX - box.left) / Math.max(1, box.width)));
		set(Math.round(ratio * (props.levels.length - 1)));
	}

	return (
		<div class="flex min-w-0 flex-col gap-2.5">
			<label for={id} class="sr-only">
				{props.label}
			</label>
			<div class="flex h-5 min-w-0 items-baseline gap-2 overflow-hidden leading-5">
				<Show when={current()} keyed>
					{(level) => (
						<span
							class={`flex min-w-0 items-baseline gap-2 ${direction() === "up" ? "kit-effort-roll-up" : "kit-effort-roll-down"}`}
						>
							<span class="shrink-0 font-medium text-body-lg text-fg">{level.name}</span>
							<span class="truncate text-caption text-fg-subtle">{MEANING[level.id] ?? ""}</span>
						</span>
					)}
				</Show>
			</div>
			{/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- the range input inside is the keyboard and screen-reader control; this is the pointer's */}
			<div
				onClick={pickAt}
				class="relative h-11 cursor-pointer rounded-full bg-fill-strong has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-accent pointer-coarse:h-12"
			>
				<div
					class="kit-effort-fill pointer-events-none absolute inset-y-0 left-0 overflow-hidden rounded-full transition-[width] duration-slow ease-[cubic-bezier(0.34,1.4,0.64,1)]"
					style={{ width: `calc(${at()} * (100% - 2.75rem) + 2.75rem)` }}
				>
					<Show when={moves()} keyed>
						<span class="kit-effort-sweep absolute inset-y-0 w-1/2" />
					</Show>
				</div>
				<span
					aria-hidden="true"
					class={`pointer-events-none absolute top-1 size-9 rounded-full bg-white shadow-float transition-[left] duration-slow ease-[cubic-bezier(0.34,1.4,0.64,1)] pointer-coarse:size-10 ${top() ? "kit-effort-glow" : ""}`}
					style={{ left: `calc(${at()} * (100% - 2.75rem) + 0.25rem)` }}
				/>
				<input
					id={id}
					type="range"
					min={0}
					max={props.levels.length - 1}
					step={1}
					value={index()}
					aria-valuetext={current()?.name}
					onInput={(event) => set(Number(event.currentTarget.value))}
					class="sr-only"
				/>
			</div>
			<div class="flex justify-between gap-1">
				<For each={props.levels}>
					{(level, place) => (
						<button
							type="button"
							tabindex={-1}
							aria-pressed={place() === index() ? "true" : "false"}
							onClick={() => set(place())}
							class="min-w-0 truncate text-caption text-fg-subtle transition-colors duration-fast hover:text-fg aria-pressed:font-medium aria-pressed:text-fg pointer-coarse:min-h-8"
						>
							{level.name}
						</button>
					)}
				</For>
			</div>
		</div>
	);
}
