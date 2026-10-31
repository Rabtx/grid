import type { JSX } from "@solidjs/web";
import { createUniqueId, For } from "solid-js";

import { tap } from "./haptics";

export type EffortLevel = { id: string; name: string };

/** What each level means, in a few words beside its name. */
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
 * How hard the model thinks (the model picker and a role's settings): one segment per level, each
 * a set of rising bars lit up to that level and its name, the chosen one raised. Above it, the
 * chosen level and what it means. A native range underneath takes the arrow keys and the screen
 * reader; the segments take the tap.
 */
export function EffortSlider(props: {
	label: string;
	levels: readonly EffortLevel[];
	value: string | null;
	onChange: (id: string) => void;
}): JSX.Element {
	const id = createUniqueId();
	const index = () =>
		Math.max(
			0,
			props.levels.findIndex((level) => level.id === props.value),
		);
	const current = () => props.levels[index()];

	function set(next: number): void {
		const level = props.levels[next];
		if (!level || next === index()) return;
		props.onChange(level.id);
		tap();
	}

	return (
		<div class="flex min-w-0 flex-col gap-2">
			<div class="flex min-w-0 items-baseline justify-between gap-3">
				<label for={id} class="shrink-0 text-caption text-fg-subtle">
					{props.label}
				</label>
				<span class="min-w-0 truncate text-caption text-fg-muted">
					{MEANING[current()?.id ?? ""] ?? ""}
				</span>
			</div>
			<input
				id={id}
				type="range"
				min={0}
				max={props.levels.length - 1}
				step={1}
				value={index()}
				aria-valuetext={current()?.name}
				onInput={(event) => set(Number(event.currentTarget.value))}
				class="peer sr-only"
			/>
			<div class="flex gap-0.5 rounded-kit bg-fill-strong p-0.5 peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
				<For each={props.levels}>
					{(level, place) => (
						<button
							type="button"
							tabindex={-1}
							aria-pressed={place() === index() ? "true" : "false"}
							onClick={() => set(place())}
							class="group/level flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-kit-sm px-1.5 text-caption text-fg-subtle transition-[background-color,color,box-shadow] duration-fast ease-out-grid hover:text-fg aria-pressed:bg-surface aria-pressed:font-medium aria-pressed:text-fg aria-pressed:shadow-knob pointer-coarse:h-10"
						>
							<Bars lit={place() + 1} of={props.levels.length} on={place() <= index()} />
							<span class="min-w-0 truncate">{level.name}</span>
						</button>
					)}
				</For>
			</div>
		</div>
	);
}

/** Rising bars, `lit` of `of` filled: how much thinking a level asks for, at a glance. */
function Bars(props: { lit: number; of: number; on: boolean }): JSX.Element {
	const count = () => Math.min(4, Math.max(1, props.of));
	const filled = () => Math.max(1, Math.round((props.lit / Math.max(1, props.of)) * count()));
	return (
		<span aria-hidden="true" class="flex h-3 shrink-0 items-end gap-px max-md:hidden">
			<For each={Array.from({ length: count() }, (_, bar) => bar)}>
				{(bar) => (
					<span
						class={`w-0.5 rounded-full transition-colors duration-fast ${bar < filled() ? (props.on ? "bg-accent" : "bg-fg-subtle") : "bg-fg-faint/40"}`}
						style={{ height: `${((bar + 1) / count()) * 100}%` }}
					/>
				)}
			</For>
		</span>
	);
}
