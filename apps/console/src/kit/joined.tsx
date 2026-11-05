// A set of header buttons is a group; a fieldset is for form fields.
/* oxlint-disable jsx-a11y/prefer-tag-over-role */
import type { JSX } from "@solidjs/web";

/**
 * Buttons joined into one pill, after iOS 26 and 27's toolbars: one solid fill, one round edge,
 * no dividers; each button a segment that lights when pressed or open. `md` is the phone header's
 * (measured on iOS: 44pt tall, items about 48pt wide, a lone button a 44pt circle); `sm` is a
 * panel header's, 32px on desktop and the full thumb size on touch.
 */
export function Joined(props: {
	label: string;
	size?: "sm" | "md";
	children: JSX.Element;
}): JSX.Element {
	return (
		<div
			role="group"
			aria-label={props.label}
			class={`flex shrink-0 items-center rounded-pill bg-fill-strong p-0.5 ${props.size === "sm" ? "h-8 pointer-coarse:h-11 [&>button:only-of-type]:min-w-7 pointer-coarse:[&>button:only-of-type]:min-w-10" : "h-11 [&>button:only-of-type]:min-w-10"} [&>button:only-of-type]:px-0`}
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

/** A segment of a `sm` pill (a panel header): 28px on desktop, 40px on touch. */
export const JOINED_BUTTON_SM = `${SEGMENT} h-7 min-w-9 px-2 [&_svg]:size-4 pointer-coarse:h-10 pointer-coarse:min-w-12 pointer-coarse:[&_svg]:size-5`;
