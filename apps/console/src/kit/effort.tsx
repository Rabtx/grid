import type { JSX } from "@solidjs/web";
import { createSignal, createUniqueId, For, Show } from "solid-js";

export type EffortLevel = { id: string; name: string };

type Spark = { key: number; dx: number; rise: number; delay: number; size: number };

/**
 * How hot a level is, 0 at the lowest and 1 at the top, as a hue: cool blue building through
 * violet and magenta to red — power gathering, never a green "go" in the middle.
 */
function heatHue(heat: number): number {
	return (215 + 153 * heat) % 360;
}

function color(heat: number, lightness = 58): string {
	return `hsl(${heatHue(heat)} 92% ${lightness}%)`;
}

function tick(heavy: boolean): void {
	try {
		navigator.vibrate?.(heavy ? [14, 40, 22] : 10);
	} catch {
		// No vibration here; the slider works the same without it.
	}
}

let sparkKey = 0;

/**
 * How hard the model thinks, as a slider of steps. The fill heats from cool blue to red as it
 * climbs; each step up sends a ring and a burst of sparks off the thumb, more the higher it goes,
 * and the top step runs hot. Stepping down is calm. A native range underneath takes the drag,
 * the tap, the arrow keys and the screen reader, so it behaves like any slider.
 */
export function EffortSlider(props: {
	label: string;
	levels: readonly EffortLevel[];
	value: string | null;
	onChange: (id: string) => void;
}): JSX.Element {
	const id = createUniqueId();
	const [direction, setDirection] = createSignal<"up" | "down">("up");
	const [sparks, setSparks] = createSignal<Spark[]>([]);
	const [pulse, setPulse] = createSignal(0);
	const last = () => Math.max(props.levels.length - 1, 1);
	const index = () =>
		Math.max(
			0,
			props.levels.findIndex((level) => level.id === props.value),
		);
	const heat = () => index() / last();
	const percent = () => (index() / last()) * 100;
	const current = () => props.levels[index()];
	const top = () => index() === props.levels.length - 1 && props.levels.length > 1;

	function set(next: number): void {
		const level = props.levels[next];
		if (!level || next === index()) return;
		const rising = next > index();
		setDirection(rising ? "up" : "down");
		props.onChange(level.id);
		if (!rising) return;
		// The higher the level, the bigger the burst.
		const strength = next / last();
		const burst = Array.from({ length: 4 + Math.round(strength * 10) }, () => ({
			key: ++sparkKey,
			dx: (Math.random() - 0.5) * (18 + strength * 40),
			rise: 16 + Math.random() * (14 + strength * 26),
			delay: Math.random() * 90,
			size: 2 + Math.random() * (2 + strength * 2),
		}));
		setSparks((all) => [...all, ...burst]);
		setPulse((n) => n + 1);
		tick(next === props.levels.length - 1);
		setTimeout(() => {
			const done = new Set(burst.map((spark) => spark.key));
			setSparks((all) => all.filter((spark) => !done.has(spark.key)));
		}, 900);
	}

	return (
		<div class="flex min-w-0 flex-col gap-1.5">
			<div class="flex items-baseline justify-between gap-3">
				<label for={id} class="text-caption text-fg-subtle">
					{props.label}
				</label>
				<span class="relative h-5 overflow-hidden text-right font-medium text-body leading-5">
					<Show when={current()} keyed>
						{(level) => (
							<span
								class={`block ${direction() === "up" ? "kit-effort-roll-up" : "kit-effort-roll-down"}`}
								style={{ color: color(heat(), 62) }}
							>
								{level.name}
							</span>
						)}
					</Show>
				</span>
			</div>
			<div class="relative h-7 rounded-kit has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-accent/60">
				{/* The track and its heating fill. */}
				<div class="absolute inset-x-2 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-fill-strong">
					<div
						class={`h-full rounded-full transition-[width] duration-slow ease-[cubic-bezier(0.34,1.56,0.64,1)] ${top() ? "kit-effort-hot" : ""}`}
						style={{
							width: `${percent()}%`,
							// At the top the fill runs hot: a seamless loop of the hottest colours sliding along.
							"background-image": top()
								? `linear-gradient(90deg, ${color(0.8)}, ${color(1)}, ${color(1, 72)}, ${color(1)}, ${color(0.8)})`
								: `linear-gradient(90deg, ${color(0)}, ${color(heat())})`,
						}}
					/>
				</div>
				{/* A notch per level, lit once the fill reaches it. */}
				<div class="pointer-events-none absolute inset-x-2 top-1/2">
					<For each={props.levels}>
						{(level, at) => (
							<span
								title={level.name}
								class={`absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors duration-fast ${at() <= index() ? "" : "bg-fg-faint"} ${at() === index() && direction() === "up" ? "kit-effort-pop" : ""}`}
								style={{
									left: `${(at() / last()) * 100}%`,
									background: at() <= index() ? "white" : undefined,
									opacity: at() <= index() ? 0.85 : undefined,
								}}
							/>
						)}
					</For>
				</div>
				{/* The thumb, springing to its step, glowing the colour it has reached. */}
				<div class="pointer-events-none absolute inset-x-2 top-1/2">
					<div
						class="absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white transition-[left,box-shadow] duration-slow ease-[cubic-bezier(0.34,1.56,0.64,1)]"
						style={{
							left: `${percent()}%`,
							"box-shadow": `0 0 0 1px rgb(0 0 0 / 0.12), 0 1px 3px rgb(0 0 0 / 0.25), 0 0 ${6 + heat() * 14}px ${color(heat())}`,
						}}
					>
						<Show when={pulse()} keyed>
							<span
								class="kit-effort-ring absolute top-1/2 left-1/2 size-4 rounded-full border-2"
								style={{ "border-color": color(heat()) }}
							/>
						</Show>
						<For each={sparks()}>
							{(spark) => (
								<span
									class="kit-effort-spark absolute top-1/2 left-1/2 rounded-full"
									style={{
										width: `${spark.size}px`,
										height: `${spark.size}px`,
										background: color(heat(), 64),
										"box-shadow": `0 0 6px ${color(heat())}`,
										"--dx": `${spark.dx}px`,
										"--rise": `${spark.rise}px`,
										"animation-delay": `${spark.delay}ms`,
									}}
								/>
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
					class="absolute inset-0 w-full cursor-pointer appearance-none bg-transparent opacity-0 outline-none"
				/>
			</div>
			<div class="relative mx-2 h-4">
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
		</div>
	);
}
