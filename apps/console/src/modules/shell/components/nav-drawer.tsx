import { useLocation } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect } from "solid-js";

import { CloseIcon } from "./icons";
import { ProjectNav } from "./project-nav";

/**
 * Phone navigation: a native modal `<dialog>` sliding in from the left. `showModal()` gives
 * focus trapping, Escape and the inert backdrop; this adds backdrop-click and close-on-navigate.
 * It stays mounted so opening is just `showModal()` on the element handed to `dialogRef`.
 */
export function NavDrawer(props: { dialogRef: (el: HTMLDialogElement) => void }): JSX.Element {
	const location = useLocation();
	let dialog: HTMLDialogElement | undefined;

	createEffect(
		() => location.pathname,
		() => {
			if (dialog?.open) dialog.close();
		},
	);

	return (
		// oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- backdrop light-dismiss; the modal dialog already closes on Escape
		<dialog
			ref={(el) => {
				dialog = el;
				props.dialogRef(el);
			}}
			aria-label="Navigation"
			onClick={(event) => {
				if (event.target === event.currentTarget) event.currentTarget.close();
			}}
			class="m-0 h-dvh max-h-dvh w-[min(20rem,calc(100vw-3rem))] max-w-none -translate-x-full border-0 border-border border-r bg-background p-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-foreground transition-[translate,display,overlay] transition-discrete duration-slow ease-out-grid backdrop:bg-black/40 open:translate-x-0 starting:open:-translate-x-full lg:hidden"
		>
			<div class="relative h-full">
				<button
					type="button"
					aria-label="Close navigation"
					onClick={() => dialog?.close()}
					class="absolute top-2 right-2 flex size-11 items-center justify-center rounded-md hover:bg-accent focus-visible:bg-accent"
				>
					<CloseIcon />
				</button>
				<ProjectNav />
			</div>
		</dialog>
	);
}
