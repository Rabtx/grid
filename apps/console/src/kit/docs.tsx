import type { JSX } from "@solidjs/web";
import { For } from "solid-js";

/**
 * Pieces for documenting the kit on /design: a labelled specimen card, the token swatches, a
 * frame for app previews. They show tokens directly, so they live here rather than in a screen.
 */
export function Specimen(props: {
	label: string;
	children: JSX.Element;
	class?: string;
}): JSX.Element {
	return (
		<div class={`surface-card flex flex-col gap-3 p-4 ${props.class ?? ""}`}>
			<p class="text-caption text-fg-subtle">{props.label}</p>
			{props.children}
		</div>
	);
}

const SURFACES = [
	{ class: "bg-surface", label: "Surface" },
	{ class: "bg-surface-sunken", label: "Sunken" },
	{ class: "bg-surface-raised shadow-float", label: "Raised" },
	{ class: "bg-fill", label: "Fill · hover" },
	{ class: "bg-fill-strong", label: "Fill · selected" },
	{ class: "bg-inverse text-inverse-fg", label: "Inverse" },
];

/** The surfaces and fills, side by side. */
export function SurfaceSwatches(): JSX.Element {
	return (
		<div class="grid grid-cols-3 gap-2 text-caption">
			<For each={SURFACES}>
				{(swatch) => (
					<div class={`flex h-16 items-end rounded-kit p-2 ring-line ${swatch.class}`}>
						{swatch.label}
					</div>
				)}
			</For>
		</div>
	);
}

const RADII = [
	{ class: "rounded-kit-sm", label: "sm · chips" },
	{ class: "rounded-kit", label: "base · controls" },
	{ class: "rounded-kit-md", label: "md · rows" },
	{ class: "rounded-kit-lg", label: "lg · cards" },
	{ class: "rounded-kit-xl", label: "xl · floating" },
	{ class: "rounded-kit-2xl", label: "2xl · composer" },
];

/** The corner scale, which the roundness knob stretches. */
export function RadiusScale(): JSX.Element {
	return (
		<div class="flex flex-wrap items-end gap-3">
			<For each={RADII}>
				{(radius) => (
					<div class="flex flex-col items-center gap-1">
						<span class={`size-10 bg-fill-strong ${radius.class}`} />
						<span class="text-micro text-fg-subtle">{radius.label}</span>
					</div>
				)}
			</For>
		</div>
	);
}

/** A fixed-height frame an app preview runs inside, like a window. */
export function PreviewFrame(props: { children: JSX.Element }): JSX.Element {
	return (
		<div class="relative flex h-[42rem] overflow-hidden rounded-kit-xl bg-surface-sunken shadow-raise md:h-[44rem]">
			{props.children}
		</div>
	);
}
