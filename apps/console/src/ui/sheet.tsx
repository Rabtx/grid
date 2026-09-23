import type { JSX } from "@solidjs/web";
import { createEffect } from "solid-js";

type SheetPlacement = "bottom" | "side";

// `bottom`: a bottom sheet on phones that becomes a dialog anchored ~22% from the top at md.
// `side`: a navigation drawer from the left. Both slide on the sheet easing and honour
// reduced motion through the duration tokens.
const PLACEMENT: Record<SheetPlacement, string> = {
	bottom:
		"mx-0 mt-auto mb-0 w-full max-w-none translate-y-full rounded-t-xl border-ink/10 border-t pb-[env(safe-area-inset-bottom)] open:translate-y-0 starting:open:translate-y-full md:mx-auto md:mt-[22vh] md:w-[min(28rem,calc(100vw-1.5rem))] md:translate-y-0 md:rounded-lg md:border md:pb-0 md:opacity-0 md:shadow-xl md:open:opacity-100 md:starting:open:translate-y-1 md:starting:open:opacity-0",
	side: "m-0 h-dvh max-h-dvh w-[min(20rem,calc(100vw-3.25rem))] max-w-none -translate-x-full border-ink/10 border-r pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] open:translate-x-0 starting:open:-translate-x-full lg:hidden",
};

/**
 * A native modal `<dialog>` used for every sheet and drawer. `showModal()` supplies focus
 * trapping, Escape and an inert page; this adds backdrop-click dismissal and keeps `open` in
 * sync with the element, so callers only own a boolean.
 */
export function Sheet(props: {
	open: boolean;
	onClose: () => void;
	label: string;
	placement?: SheetPlacement;
	children: JSX.Element;
}): JSX.Element {
	let dialog: HTMLDialogElement | undefined;

	createEffect(
		() => props.open,
		(open) => {
			if (!dialog) return;
			if (open && !dialog.open) dialog.showModal();
			else if (!open && dialog.open) dialog.close();
		},
	);

	return (
		// oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- backdrop light-dismiss; the modal dialog already closes on Escape
		<dialog
			ref={(el) => {
				dialog = el;
			}}
			aria-label={props.label}
			onClose={() => props.onClose()}
			onClick={(event) => {
				if (event.target === event.currentTarget) props.onClose();
			}}
			class={`bg-canvas p-0 text-ink transition-[translate,opacity,display,overlay] transition-discrete duration-slow ease-sheet backdrop:bg-black/40 ${PLACEMENT[props.placement ?? "bottom"]}`}
		>
			{props.children}
		</dialog>
	);
}
