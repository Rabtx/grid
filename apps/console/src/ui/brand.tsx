import type { JSX } from "@solidjs/web";

/**
 * The brand artwork is white on transparent, drawn for a dark surface. On the light canvas
 * `invert` takes the white marks to near-black and `hue-rotate-180` returns the accent petal to
 * its mint after the inversion flipped it; the dark theme shows the file untouched.
 */
const THEME_FIX = "invert hue-rotate-180 dark:invert-0 dark:hue-rotate-0";

/** The Grid wordmark (mark + name). Height is set by `class`; width follows the artwork. */
export function BrandLogo(props: { class?: string }): JSX.Element {
	return (
		<img
			src="/brand/grid-logo-480.png"
			alt="Grid"
			width="480"
			height="189"
			decoding="async"
			class={`h-5 w-auto select-none ${THEME_FIX} ${props.class ?? ""}`}
		/>
	);
}

/** The four-petal mark alone, for tight spaces. Decorative: pair it with visible text. */
export function BrandMark(props: { class?: string }): JSX.Element {
	return (
		<img
			src="/brand/grid-mark-96.png"
			alt=""
			aria-hidden="true"
			width="96"
			height="96"
			decoding="async"
			class={`size-6 select-none ${THEME_FIX} ${props.class ?? ""}`}
		/>
	);
}
