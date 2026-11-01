import type { JSX } from "@solidjs/web";
import { createMemo, createSignal, createUniqueId, For, onSettled } from "solid-js";

/**
 * The composer at work (ported from BoardUI's Composer Loader): an iridescent band of light
 * travelling the card's rim at constant speed, a crisp refraction line leading a tight glow and a
 * wide bloom that bleeds inward behind it. `active` fades it in and out (450ms), so sending reads
 * as the composer lighting up rather than switching.
 *
 * It is a layer, not a wrapper: put it first inside a positioned card that is its own stacking
 * context (`relative z-*` or `isolate`). It sits behind the card's content, above its surface,
 * and takes the card's corner (`border-radius: inherit`), so it follows Settings → Appearance →
 * Corners: a pill, rounded, soft or square band. Under reduced motion the band stays still.
 *
 * The band is dash segments on an SVG stroke of the card's shape, normalised with `pathLength`
 * so it travels at one speed and bends around the corners. The blur is SVG's own: WebKit ignores
 * CSS filters on SVG elements, which drew the light razor-sharp on every iPhone.
 */
export function ComposerLoader(props: {
	/** Show the light. Fades in and out: flip it while awaiting a reply. */
	active?: boolean;
	/** Four gradient stops, spread across the card left to right. */
	colors?: readonly [string, string, string, string];
	/** Seconds per lap. */
	speed?: number;
	/** Overall light opacity. */
	intensity?: number;
	/** How far the bloom bleeds inward from the rim, px. */
	bloom?: number;
	/** The bloom's opacity. */
	bloomStrength?: number;
	/** How much of the rim the band covers, in degrees of 360. */
	arc?: number;
	/** Travel anticlockwise. */
	reverse?: boolean;
	/** The crisp line's width, px; the tight glow scales with it. */
	line?: number;
	/**
	 * Fade the band's ends instead of cutting them, 0–1: the fraction of its length that ramps.
	 * Each layer is stacked as shorter, centred copies; the blur melts the steps together.
	 */
	taper?: number;
	/** Move the band forward along the lap, as a fraction of the rim (0–1). */
	offset?: number;
}): JSX.Element {
	const id = `kit-cl-${createUniqueId().replace(/[^a-zA-Z0-9]/g, "")}`;
	const [box, setBox] = createSignal({ w: 640, h: 52, r: 16 });
	let clip: HTMLSpanElement | undefined;

	onSettled(() => {
		const el = clip;
		if (!el) return;
		// The corner comes from the card, so a change of corner style reshapes the band too.
		const measure = () =>
			setBox({
				w: Math.max(1, el.clientWidth),
				h: Math.max(1, el.clientHeight),
				r: Number.parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0,
			});
		measure();
		const resize = new ResizeObserver(measure);
		resize.observe(el);
		const corners = new MutationObserver(measure);
		corners.observe(document.documentElement, { attributeFilter: ["data-corners"] });
		return () => {
			resize.disconnect();
			corners.disconnect();
		};
	});

	const colors = () => props.colors ?? DEFAULT_COLORS;
	// The gradient's centre is a blend of the middle stops, so the band never washes out to white.
	const mid = () => {
		const [, c1, c2] = colors();
		const a = rgb(c1);
		const b = rgb(c2);
		return `rgb(${a.map((value, index) => Math.round((value + (b[index] ?? 0)) / 2)).join(",")})`;
	};

	const line = () => props.line ?? 2.5;
	const taper = () => props.taper ?? 0;
	const crispBlur = () => (taper() > 0 ? Math.max(0.5, line() * 0.8) : 0.5);
	const blurs = () => [14, 6, crispBlur()];

	/** Every stroke drawn, widest first: the bloom, the tight glow, then the crisp line. */
	const strokes = createMemo((): Stroke[] => {
		const { w, h, r } = box();
		const speed = props.speed ?? 4.5;
		const band = ((props.arc ?? 120) / 360) * 100;
		const bloom = props.bloom ?? 16;
		const rx = Math.min(r, w / 2, h / 2);
		// Path units per px, to pull each soft layer's head back behind the tip: the rounded
		// rectangle's straight runs plus its four corner arcs.
		const perimeter = Math.max(1, 2 * (w + h) - 8 * rx + 2 * Math.PI * rx);
		const units = (px: number) => (px * 100) / perimeter;
		// A larger phase sits the band further back along the lap, so moving it forward subtracts.
		const phase = (length: number, backPx: number) =>
			(props.reverse ? units(backPx) : length - band + units(backPx)) - (props.offset ?? 0) * 100;
		const copies = taper() > 0 ? TAPER_STEPS : 1;
		const layer = (
			width: number,
			blur: number,
			opacity: number,
			dash: number,
			backPx: number,
		): Stroke[] =>
			Array.from({ length: copies }, (_, index) => {
				// Copy 0 is the whole band; each next one is shorter and moved forward by half the
				// difference, so they share a midpoint and the ends thin out step by step.
				const length = dash * (1 - (taper() * index) / copies);
				const delay = ((phase(dash, backPx) - (dash - length) / 2) * speed) / 100;
				return { width, blur, opacity: opacity / copies, length, delay, speed, rx };
			});
		return [
			...(bloom > 0
				? layer(bloom * 2, 14, props.bloomStrength ?? 0.3, band * 0.9, bloom + 16)
				: []),
			...layer(line() * 3.2, 6, 0.8, band * 0.95, 10),
			...layer(line(), crispBlur(), 1, band, 0),
		];
	});

	return (
		<span
			ref={(el) => {
				clip = el;
			}}
			aria-hidden="true"
			data-active={props.active ? "" : undefined}
			class="kit-composer-loader pointer-events-none absolute inset-0 -z-10 overflow-hidden"
		>
			<svg
				width="100%"
				height="100%"
				viewBox={`0 0 ${box().w} ${box().h}`}
				preserveAspectRatio="none"
				style={{ opacity: props.intensity ?? 0.7 }}
			>
				<defs>
					<linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
						<stop offset="0%" stop-color={colors()[0]} />
						<stop offset="30%" stop-color={colors()[1]} />
						<stop offset="50%" stop-color={mid()} />
						<stop offset="70%" stop-color={colors()[2]} />
						<stop offset="100%" stop-color={colors()[3]} />
					</linearGradient>
					<For each={blurs()}>
						{(blur) => (
							// Widened well past the stroke so the blur never clips at the filter's bounds.
							<filter id={blurId(id, blur)} x="-50%" y="-50%" width="200%" height="200%">
								<feGaussianBlur stdDeviation={blur} />
							</filter>
						)}
					</For>
				</defs>
				<For each={strokes()} keyed={false}>
					{(stroke) => (
						<rect
							x="0"
							y="0"
							width={box().w}
							height={box().h}
							rx={stroke().rx}
							pathLength="100"
							fill="none"
							stroke={`url(#${id})`}
							stroke-width={stroke().width}
							stroke-linecap={stroke().rx > 0 ? "round" : "butt"}
							stroke-dasharray={`${stroke().length} ${100 - stroke().length}`}
							filter={stroke().blur > 0 ? `url(#${blurId(id, stroke().blur)})` : undefined}
							class="kit-composer-loader-band"
							style={{
								opacity: stroke().opacity,
								"animation-duration": `${stroke().speed}s`,
								"animation-delay": `${stroke().delay}s`,
								"animation-direction": props.reverse ? "reverse" : "normal",
							}}
						/>
					)}
				</For>
			</svg>
		</span>
	);
}

type Stroke = {
	width: number;
	blur: number;
	opacity: number;
	/** The dash, in path units of 100. */
	length: number;
	/** Seconds into the lap; negative is a head start. */
	delay: number;
	speed: number;
	rx: number;
};

/** BoardUI's tuned house light: teal, sky, magenta and mint. */
const DEFAULT_COLORS = ["#5eead4", "#46baec", "#e633a4", "#00faa7"] as const;

/** Copies per layer when tapering: enough steps for the blur to melt into a gradient. */
const TAPER_STEPS = 14;

function rgb(hex: string): number[] {
	return [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
}

function blurId(id: string, blur: number): string {
	return `${id}-b${String(blur).replace(".", "_")}`;
}
