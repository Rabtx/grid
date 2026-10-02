import type { JSX } from "@solidjs/web";
import { createUniqueId, Show } from "solid-js";

import { MARK_ACCENT, MARK_INK, WORDMARK } from "./brand-paths";

/**
 * The Grid mark (Figma Logo/Grid Mark): three blocks in the theme's ink and one in the accent, so
 * it follows light, dark and a tint without separate artwork. Decorative: pair it with text.
 */
export function BrandMark(props: { class?: string }): JSX.Element {
	return (
		<svg
			viewBox="0 0 64 64"
			aria-hidden="true"
			class={`size-6 shrink-0 select-none ${props.class ?? ""}`}
		>
			<path fill-rule="evenodd" clip-rule="evenodd" d={MARK_INK} class="fill-fg" />
			<path fill-rule="evenodd" clip-rule="evenodd" d={MARK_ACCENT} class="fill-accent" />
		</svg>
	);
}

/** The wordmark alone (Figma Logo/Grid Wordmark), "GRID" in the ink. Height is set by `class`. */
export function BrandWordmark(props: { class?: string }): JSX.Element {
	const titleId = createUniqueId();
	return (
		<svg
			viewBox="0 0 80 16"
			aria-labelledby={titleId}
			class={`h-4 w-auto shrink-0 select-none ${props.class ?? ""}`}
		>
			<title id={titleId}>Grid</title>
			<path fill-rule="evenodd" clip-rule="evenodd" d={WORDMARK} class="fill-fg" />
		</svg>
	);
}

/** Mark beside the wordmark, for a header. Height is set by `class` on the row. */
export function BrandLogo(props: { class?: string }): JSX.Element {
	return (
		<span class={`inline-flex items-center gap-2 ${props.class ?? ""}`}>
			<BrandMark class="size-6" />
			<BrandWordmark class="h-3" />
		</span>
	);
}

/**
 * The splash (Figma 01 · Splash): the mark over the wordmark in the middle of the canvas, a blue
 * bar running under them, and what Grid is doing. It is what opening Grid looks like until the
 * session is known.
 */
export function Splash(props: { message?: string }): JSX.Element {
	return (
		<output
			aria-label={props.message ?? "Opening Grid"}
			class="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-6 bg-surface-sunken"
		>
			<span aria-hidden="true" class="flex flex-col items-center gap-3">
				<BrandMark class="size-16" />
				<BrandWordmark class="h-4" />
			</span>
			<span class="flex flex-col items-center gap-2">
				<span aria-hidden="true" class="h-1 w-14 overflow-hidden rounded-full bg-fill-strong">
					<span class="kit-progress block h-full w-3/5 rounded-full bg-accent" />
				</span>
				<Show when={props.message}>
					<span class="text-caption text-fg-subtle">{props.message}</span>
				</Show>
			</span>
		</output>
	);
}
