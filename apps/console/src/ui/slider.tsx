import type { JSX } from "@solidjs/web";

// A native range input keeps keyboard and screen-reader behaviour for free. The track is a thin
// ink bar; the filled part is an ink/60 gradient up to the value's percentage, and the thumb is a
// small solid ink circle drawn with the vendor pseudo-elements.
const RANGE =
	"h-1 w-full min-w-0 cursor-pointer appearance-none rounded-full bg-ink/15 focus-ring md:w-44 " +
	"[&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-ink " +
	"[&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-ink " +
	// A fingertip needs a bigger thumb than a cursor does.
	"pointer-coarse:[&::-moz-range-thumb]:size-6 pointer-coarse:[&::-webkit-slider-thumb]:size-6";

/**
 * A labelled range: the track on the left, the formatted value right-aligned beside it. The
 * caller owns the value; `onInput` reports the numeric value on every movement.
 */
export function Slider(props: {
	label: string;
	min: number;
	max: number;
	step: number;
	value: number;
	onInput: (value: number) => void;
	format: (value: number) => string;
}): JSX.Element {
	const percent = () => {
		const span = props.max - props.min;
		if (span <= 0) return 0;
		return ((props.value - props.min) / span) * 100;
	};

	return (
		<div class="flex w-full items-center gap-2 md:w-auto">
			<input
				type="range"
				aria-label={props.label}
				min={props.min}
				max={props.max}
				step={props.step}
				value={props.value}
				onInput={(event) => props.onInput(Number(event.currentTarget.value))}
				// Only the image is inline; the track colour stays the `bg-ink/15` class behind it.
				style={{
					"background-image": `linear-gradient(to right, color-mix(in srgb, var(--ink) 60%, transparent) ${percent()}%, transparent ${percent()}%)`,
				}}
				class={RANGE}
			/>
			<span class="w-12 shrink-0 text-right text-ink/70 text-ui-sm tabular-nums">
				{props.format(props.value)}
			</span>
		</div>
	);
}
