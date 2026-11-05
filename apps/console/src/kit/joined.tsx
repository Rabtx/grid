// A set of header buttons is a group; a fieldset is for form fields.
/* oxlint-disable jsx-a11y/prefer-tag-over-role */
import type { JSX } from "@solidjs/web";

/**
 * Buttons joined into one pill, as the phone header's actions: one fill, one round edge, each
 * button a segment that lights when pressed or open, a hairline before each but the first (only
 * buttons: a popover's panel sits among them and keeps its own place). 44px tall, the header's
 * size; segments are 40px wide at least, so each stays a full thumb target.
 */
export function Joined(props: { label: string; children: JSX.Element }): JSX.Element {
	return (
		<div
			role="group"
			aria-label={props.label}
			class="flex h-11 shrink-0 items-center rounded-pill bg-fill-strong p-0.5 [&>button:not(:first-child)]:relative [&>button:not(:first-child)]:before:absolute [&>button:not(:first-child)]:before:inset-y-2.5 [&>button:not(:first-child)]:before:-left-px [&>button:not(:first-child)]:before:w-px [&>button:not(:first-child)]:before:bg-line-strong [&>button:not(:first-child)]:before:content-['']"
		>
			{props.children}
		</div>
	);
}

/** A segment of a `Joined` pill: a button's or a popover trigger's class. */
export const JOINED_BUTTON =
	"focus-ring inline-grid h-10 min-w-10 shrink-0 place-items-center rounded-pill px-2.5 text-fg-muted transition-[background-color,color] duration-fast hover:bg-selection hover:text-fg aria-expanded:bg-selection aria-expanded:text-fg [&_svg]:size-5";
