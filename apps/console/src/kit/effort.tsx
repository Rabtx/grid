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
 * How hard the model thinks: a calm, stepped slider. A stop per level along the track, the fill
 * and thumb springing to the chosen one, a light sweeping along the fill as it moves; above, the
 * level's name rolls in from the side it came from, with what it means under the track; the top
 * level glows softly. A native range underneath takes the drag, the tap, the arrow keys and the
 * screen reader; the names under the stops can be tapped too.
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
	const last = () => Math.max(props.levels.length - 1, 1);
	const index = () =>
		Math.max(
			0,
			props.levels.findIndex((level) => level.id === props.value),
		);
	const percent = () => (index() / last()) * 100;
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
			<div class="relative h-8 rounded-kit has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-accent/60">
				{/* The track, and the fill up to the chosen stop with a light sweeping along it as it moves. */}
				<div class="absolute inset-x-2.5 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-fill-strong">
					<div
						class="relative h-full overflow-hidden rounded-full bg-accent transition-[width] duration-slow ease-[cubic-bezier(0.34,1.4,0.64,1)]"
						style={{ width: `${percent()}%` }}
					>
						<Show when={moves()} keyed>
							<span class="kit-effort-sweep absolute inset-y-0 w-1/2" />
						</Show>
					</div>
				</div>
				{/* A stop per level: filled once the fill reaches it. */}
				<div class="pointer-events-none absolute inset-x-2.5 top-1/2">
					<For each={props.levels}>
						{(_, at) => (
							<span
								class={`absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface transition-colors duration-normal ${at() <= index() ? "bg-accent" : "bg-fill-strong"}`}
								style={{ left: `${(at() / last()) * 100}%` }}
							/>
						)}
					</For>
				</div>
				{/* The thumb, springing to its stop; at the top level it glows. */}
				<div class="pointer-events-none absolute inset-x-2.5 top-1/2">
					<div
						class={`absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-raise ring-1 ring-black/10 transition-[left] duration-slow ease-[cubic-bezier(0.34,1.4,0.64,1)] ${top() ? "kit-effort-glow" : ""}`}
						style={{ left: `${percent()}%` }}
					>
						<span class="absolute inset-1.5 rounded-full bg-accent" />
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
					class="absolute inset-0 w-full cursor-pointer appearance-none bg-transparent opacity-0 outline-none"
				/>
			</div>
			<div class="relative mx-2.5 h-4">
				<For each={props.levels}>
					{(level, at) => (
						<button
							type="button"
							tabindex={-1}
							onClick={() => set(at())}
							class={`absolute top-0 -translate-x-1/2 whitespace-nowrap text-micro transition-colors duration-fast first:translate-x-0 last:-translate-x-full ${at() === index() ? "text-fg" : "text-fg-faint hover:text-fg-subtle"}`}
							style={{ left: `${(at() / last()) * 100}%` }}
						>
							{level.name}
						</button>
					)}
				</For>
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
