import type { JSX } from "@solidjs/web";
import { createSignal, createUniqueId, For, Show } from "solid-js";

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

function tick(): void {
	try {
		navigator.vibrate?.(8);
	} catch {
		// No vibration here; the slider works the same without it.
	}
}

/**
 * How hard the model thinks: a segmented control, one segment per level, with an accent knob that
 * springs to the chosen one — lit along its top, a light sweeping across it as it moves, glowing
 * softly at the top level. Above, the level's name rolls in from the side it came from; under it,
 * what that level means. A native range underneath takes the arrow keys and the screen reader;
 * the segments take the tap.
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
	const count = () => Math.max(props.levels.length, 1);
	const index = () =>
		Math.max(
			0,
			props.levels.findIndex((level) => level.id === props.value),
		);
	const current = () => props.levels[index()];
	const top = () => index() === props.levels.length - 1 && props.levels.length > 1;

	function set(next: number): void {
		const level = props.levels[next];
		if (!level || next === index()) return;
		setDirection(next > index() ? "up" : "down");
		setMoves((n) => n + 1);
		props.onChange(level.id);
		tick();
	}

	return (
		<div class="flex min-w-0 flex-col gap-2">
			<div class="flex items-baseline justify-between gap-3">
				<label for={id} class="text-caption text-fg-subtle">
					{props.label}
				</label>
				<span class="relative h-5 overflow-hidden text-right font-medium text-body text-fg leading-5">
					<Show when={current()} keyed>
						{(level) => (
							<span
								class={`block ${direction() === "up" ? "kit-effort-roll-up" : "kit-effort-roll-down"}`}
							>
								{level.name}
							</span>
						)}
					</Show>
				</span>
			</div>
			<div class="relative rounded-kit bg-fill-strong p-0.5 shadow-[inset_0_1px_2px_rgb(0_0_0/0.08)] has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-accent">
				<div class="relative">
					{/* The knob, springing to its segment; a light sweeps across it as it moves. */}
					<div
						class={`surface-primary pointer-events-none absolute inset-y-0 overflow-hidden rounded-kit-sm bg-accent transition-[left] duration-slow ease-[cubic-bezier(0.34,1.4,0.64,1)] ${top() ? "kit-effort-glow" : ""}`}
						style={{ left: `${(index() / count()) * 100}%`, width: `${100 / count()}%` }}
					>
						<Show when={moves()} keyed>
							<span class="kit-effort-sweep absolute inset-y-0 w-1/2" />
						</Show>
					</div>
					<div
						class="relative grid"
						style={{ "grid-template-columns": `repeat(${count()}, minmax(0, 1fr))` }}
					>
						<For each={props.levels}>
							{(level, at) => (
								<button
									type="button"
									tabindex={-1}
									aria-pressed={at() === index() ? "true" : "false"}
									onClick={() => set(at())}
									class="h-7 min-w-0 truncate px-1 text-caption text-fg-subtle transition-colors duration-fast hover:text-fg aria-pressed:font-medium aria-pressed:text-white pointer-coarse:h-9"
								>
									{level.name}
								</button>
							)}
						</For>
					</div>
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
					class="sr-only"
				/>
			</div>
			<span class="relative h-4 overflow-hidden text-caption text-fg-subtle leading-4">
				<Show when={current()} keyed>
					{(level) => (
						<span
							class={`block ${direction() === "up" ? "kit-effort-roll-up" : "kit-effort-roll-down"}`}
						>
							{MEANING[level.id] ?? " "}
						</span>
					)}
				</Show>
			</span>
		</div>
	);
}
