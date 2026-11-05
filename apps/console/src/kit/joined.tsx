// A set of header buttons is a group; a fieldset is for form fields.
/* oxlint-disable jsx-a11y/prefer-tag-over-role */
import type { JSX } from "@solidjs/web";

/**
 * Buttons joined into one pill, after iOS 26 and 27's toolbars: one solid fill, one round edge,
 * no dividers; each button a segment that lights when pressed or open. `md` is the phone header's
 * (measured on iOS: 44pt tall, items about 48pt wide, a lone button a 44pt circle) for
 * `JOINED_BUTTON` segments; `sm` only joins the buttons it is given (a panel header's own icon
 * buttons), at their own size and look.
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
			class={`flex shrink-0 items-center rounded-pill bg-fill-strong p-0.5 ${props.size === "sm" ? "" : "h-11 [&>button:only-of-type]:min-w-10 [&>button:only-of-type]:px-0"}`}
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
