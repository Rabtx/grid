// A set of header buttons is a group; a fieldset is for form fields.
/* oxlint-disable jsx-a11y/prefer-tag-over-role */
import type { JSX } from "@solidjs/web";

/**
 * Buttons joined into one pill, after iOS 26 and 27's toolbars: one solid fill, one round edge,
 * no dividers; each `JOINED_BUTTON` a segment with no fill of its own, lit only when pressed or
 * open. Measured on iOS: 44pt tall, items about 48pt wide, a lone button a 44pt circle.
 */
export function Joined(props: {
	label: string;
	/** `compact`: a panel header's, where a mouse is used: 36px tall with 32px segments, and the
	 * full size on touch. Its segments take `JOINED_BUTTON_COMPACT`. */
	compact?: boolean;
	children: JSX.Element;
}): JSX.Element {
	return (
		<div
			role="group"
			aria-label={props.label}
			class={`flex h-11 shrink-0 items-center rounded-pill bg-fill-strong p-0.5 [&>button:only-of-type]:min-w-10 [&>button:only-of-type]:px-0 ${props.compact ? "pointer-fine:h-9" : ""}`}
		>
			{props.children}
		</div>
	);
}

const SEGMENT =
	"focus-ring inline-grid shrink-0 place-items-center rounded-pill text-fg transition-[background-color,color] duration-fast hover:bg-selection aria-expanded:bg-selection";

/**
 * A segment of a `Joined` pill: a button's or a popover trigger's class. Its glyph is in full
 * ink, as iOS draws its toolbar symbols.
 */
export const JOINED_BUTTON = `${SEGMENT} h-10 min-w-12 px-2.5 [&_svg]:size-5`;

/** A segment of a `compact` pill: 32px with a mouse, the full size on touch. */
export const JOINED_BUTTON_COMPACT = `${JOINED_BUTTON} pointer-fine:h-8 pointer-fine:min-w-8 pointer-fine:px-0 pointer-fine:[&_svg]:size-4`;
