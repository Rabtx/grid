import type { JSX } from "@solidjs/web";
import { createSignal, createUniqueId, For } from "solid-js";

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
							class="group/level flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-control-sm px-1.5 text-caption text-fg-subtle transition-[background-color,color,box-shadow] duration-fast ease-out-grid hover:text-fg aria-pressed:bg-surface aria-pressed:font-medium aria-pressed:text-fg aria-pressed:shadow-knob pointer-coarse:h-10"
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

/** A spring that overshoots a touch and settles: the knob landing on a level. */
const SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)";

/**
 * How hard the model thinks, as a real slider (a proposal on /design, not yet in the app): a
 * thin track with a dot at each level, filled in the accent up to the knob. The knob follows the
 * finger while dragged and springs onto the nearest level when let go; tapping the track jumps
 * there; the arrow keys step. Above it the level's name rolls like an odometer, beside a meter
 * whose bars rise one after another, and what the level means. The model's default level is
 * marked under its dot. Each level crossed gives a light tick. Without motion it simply snaps.
 */
export function EffortDial(props: {
	label: string;
	levels: readonly EffortLevel[];
	value: string | null;
	onChange: (id: string) => void;
	/** The model's own default level, marked under its dot. */
	defaultId?: string | null;
}): JSX.Element {
	const id = createUniqueId();
	const count = () => Math.max(1, props.levels.length);
	const index = () =>
		Math.max(
			0,
			props.levels.findIndex((level) => level.id === props.value),
		);
	const at = (place: number) => (count() === 1 ? 0 : (place / (count() - 1)) * 100);
	// While dragged, where the knob is (percent along the track); null when it rests on a level.
	const [drag, setDrag] = createSignal<number | null>(null);
	const position = () => drag() ?? at(index());
	let track: HTMLDivElement | undefined;

	function choose(place: number): void {
		const level = props.levels[Math.max(0, Math.min(count() - 1, place))];
		if (!level || level.id === props.value) return;
		props.onChange(level.id);
		tap();
	}
	const nearest = (percent: number) => Math.round((percent / 100) * (count() - 1));
	function percentAt(clientX: number): number {
		const box = track?.getBoundingClientRect();
		if (!box || box.width === 0) return position();
		return Math.max(0, Math.min(100, ((clientX - box.left) / box.width) * 100));
	}

	return (
		<div class="flex min-w-0 flex-col gap-3">
			<div class="flex min-w-0 items-end justify-between gap-3">
				<div class="flex min-w-0 flex-col gap-1">
					<label for={id} class="text-caption text-fg-subtle">
						{props.label}
					</label>
					<div class="flex items-center gap-2">
						<Meter lit={index() + 1} of={count()} />
						{/* The name rolls to the new level, like an odometer. */}
						<span class="relative block h-5 overflow-hidden" aria-hidden="true">
							<span
								class="flex flex-col transition-transform duration-base motion-reduce:transition-none"
								style={{
									transform: `translateY(-${index() * 1.25}rem)`,
									"transition-timing-function": SPRING,
								}}
							>
								<For each={props.levels}>
									{(level, place) => (
										<span
											class={`block h-5 font-medium text-body leading-5 transition-colors duration-base ${place() === index() ? "text-fg" : "text-fg-faint"}`}
										>
											{level.name}
										</span>
									)}
								</For>
							</span>
						</span>
					</div>
				</div>
				<span
					class="relative block h-4 min-w-0 flex-1 overflow-hidden text-right"
					aria-hidden="true"
				>
					<span
						class="flex flex-col transition-transform duration-base ease-out-grid motion-reduce:transition-none"
						style={{ transform: `translateY(-${index()}rem)` }}
					>
						<For each={props.levels}>
							{(level) => (
								<span class="block h-4 truncate text-caption leading-4 text-fg-subtle">
									{MEANING[level.id] ?? ""}
								</span>
							)}
						</For>
					</span>
				</span>
			</div>

			<input
				id={id}
				type="range"
				min={0}
				max={count() - 1}
				step={1}
				value={index()}
				aria-valuetext={props.levels[index()]?.name}
				onInput={(event) => choose(Number(event.currentTarget.value))}
				class="peer sr-only"
			/>
			{/* The track, inset by half the knob so the end levels sit under its middle. */}
			<div class="rounded-pill px-3.5 peer-focus-visible:outline-2 peer-focus-visible:outline-accent peer-focus-visible:outline-offset-4">
				<div
					ref={(el) => {
						track = el;
					}}
					class="relative h-8 cursor-pointer touch-none select-none"
					onPointerDown={(event) => {
						event.preventDefault();
						const target = event.currentTarget;
						target.setPointerCapture(event.pointerId);
						const start = percentAt(event.clientX);
						setDrag(start);
						choose(nearest(start));
						const move = (next: PointerEvent) => {
							const percent = percentAt(next.clientX);
							setDrag(percent);
							choose(nearest(percent));
						};
						const end = () => {
							setDrag(null);
							target.removeEventListener("pointermove", move);
							target.removeEventListener("pointerup", end);
							target.removeEventListener("pointercancel", end);
						};
						target.addEventListener("pointermove", move);
						target.addEventListener("pointerup", end);
						target.addEventListener("pointercancel", end);
					}}
				>
					<span class="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-fill-strong" />
					<span
						class="absolute top-1/2 left-0 h-1.5 -translate-y-1/2 rounded-full bg-accent"
						style={{
							width: `${position()}%`,
							transition: drag() === null ? `width 420ms ${SPRING}` : "none",
						}}
					/>
					<For each={props.levels}>
						{(level, place) => (
							<span
								aria-hidden="true"
								class={`absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors duration-base ${at(place()) <= position() + 0.5 ? "bg-white/70" : "bg-fg-faint"} ${level.id === props.defaultId ? "ring-2 ring-fg-subtle/40" : ""}`}
								style={{ left: `${at(place())}%` }}
							/>
						)}
					</For>
					<span
						aria-hidden="true"
						class={`absolute top-1/2 h-6 w-7 -translate-x-1/2 -translate-y-1/2 rounded-pill bg-white shadow-knob transition-[scale] duration-fast ease-out-grid ${drag() === null ? "scale-100" : "scale-110"}`}
						style={{
							left: `${position()}%`,
							transition:
								drag() === null
									? `left 420ms ${SPRING}, scale 200ms ease-out`
									: "scale 200ms ease-out",
						}}
					/>
				</div>
			</div>

			{/* Each level's name under its dot; the chosen one in full ink, the default marked. */}
			<div class="relative h-4 px-3.5">
				<div class="relative h-full">
					<For each={props.levels}>
						{(level, place) => (
							<button
								type="button"
								tabindex={-1}
								onClick={() => choose(place())}
								class={`absolute top-0 text-caption whitespace-nowrap transition-colors duration-base ${place() === 0 ? "-translate-x-3.5" : place() === count() - 1 ? "-translate-x-[calc(100%-0.875rem)]" : "-translate-x-1/2"} ${place() === index() ? "font-medium text-fg" : "text-fg-subtle hover:text-fg"}`}
								style={{ left: `${at(place())}%` }}
							>
								{level.name}
								{level.id === props.defaultId ? " ·" : ""}
							</button>
						)}
					</For>
				</div>
			</div>
		</div>
	);
}

/** Rising bars, lit up to the level one after another: a little equaliser for how hard it thinks. */
function Meter(props: { lit: number; of: number }): JSX.Element {
	const bars = 5;
	const filled = () => Math.max(1, Math.round((props.lit / Math.max(1, props.of)) * bars));
	return (
		<span aria-hidden="true" class="flex h-4 items-end gap-0.5">
			<For each={Array.from({ length: bars }, (_, bar) => bar)}>
				{(bar) => (
					<span
						class={`w-1 rounded-full transition-[height,background-color] duration-base motion-reduce:transition-none ${bar < filled() ? "bg-accent" : "bg-fg-faint/40"}`}
						style={{
							height: bar < filled() ? `${((bar + 1) / bars) * 100}%` : "20%",
							"transition-delay": `${bar * 40}ms`,
							"transition-timing-function": SPRING,
						}}
					/>
				)}
			</For>
		</span>
	);
}
