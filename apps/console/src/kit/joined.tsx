// A set of header buttons is a group; a fieldset is for form fields.
/* oxlint-disable jsx-a11y/prefer-tag-over-role */
import type { JSX } from "@solidjs/web";

/**
 * Buttons joined into one pill, as the phone header's actions (after iOS 26 and 27's toolbars):
 * one solid fill, one round edge, no dividers; each button a segment that lights when pressed or open. As measured
 * on iOS: 44pt tall, items about 48pt wide in a pill, and a lone button a 44pt circle, so a
 * header can mix lone and joined ones. 44px tall, the header's
 * size; segments are 40px wide at least, so each stays a full thumb target.
 */
export function Joined(props: { label: string; children: JSX.Element }): JSX.Element {
	return (
		<div
			role="group"
			aria-label={props.label}
			class="flex h-11 shrink-0 items-center rounded-pill bg-fill-strong p-0.5 [&>button:only-of-type]:min-w-10 [&>button:only-of-type]:px-0"
		>
			{props.children}
		</div>
	);
}

/** A segment of a `Joined` pill: a button's or a popover trigger's class. */
export const JOINED_BUTTON =
	"focus-ring inline-grid h-10 min-w-12 shrink-0 place-items-center rounded-pill px-2.5 text-fg-muted transition-[background-color,color] duration-fast hover:bg-selection hover:text-fg aria-expanded:bg-selection aria-expanded:text-fg [&_svg]:size-5";
