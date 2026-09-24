import type { JSX } from "@solidjs/web";
import { createEffect, Show } from "solid-js";

import { followFinger, shouldDismiss, SWIPE_SLOP_PX, type SwipeDirection } from "./swipe";

type SheetPlacement = "bottom" | "side" | "panel";

// `bottom`: a bottom sheet on phones that becomes a dialog anchored ~22% from the top at md.
// `side`: a navigation drawer from the left.
// `panel`: full-screen on phones; from lg a right-hand side panel that slides in from the right.
// All slide on the sheet easing and honour reduced motion through the duration tokens.
const PLACEMENT: Record<SheetPlacement, string> = {
	bottom:
		"mx-0 mt-auto mb-0 w-full max-w-none translate-y-full rounded-t-xl border-ink/10 border-t pb-[env(safe-area-inset-bottom)] open:translate-y-0 starting:open:translate-y-full md:mx-auto md:mt-[22vh] md:w-[min(28rem,calc(100vw-1.5rem))] md:translate-y-0 md:rounded-lg md:border md:pb-0 md:opacity-0 md:shadow-xl md:open:opacity-100 md:starting:open:translate-y-1 md:starting:open:opacity-0",
	side: "m-0 h-dvh max-h-dvh w-[min(20rem,calc(100vw-3.25rem))] max-w-none -translate-x-full border-ink/10 border-r pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] open:translate-x-0 starting:open:-translate-x-full lg:hidden",
	panel:
		"m-0 h-dvh max-h-dvh w-full max-w-none translate-y-full rounded-none border-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] open:translate-y-0 starting:open:translate-y-full lg:ml-auto lg:mr-0 lg:h-dvh lg:w-[min(30rem,100vw)] lg:border-l lg:border-ink/10 lg:translate-x-full lg:translate-y-0 lg:open:translate-x-0 lg:open:translate-y-0 lg:starting:open:translate-x-full lg:starting:open:translate-y-0",
};

// Controls that own their own drag: swiping on them must not move the sheet.
const OWN_GESTURES = 'input, textarea, select, [contenteditable="true"], [data-no-swipe]';

/**
 * The way this sheet is swiped away right now, or null. The panel only slides down while it is
 * a full-screen phone sheet; from lg it is a side panel closed with its button or Escape.
 */
function swipeDirection(placement: SheetPlacement): SwipeDirection | null {
	if (placement === "side") return "left";
	if (placement === "panel" && matchMedia("(min-width: 64rem)").matches) return null;
	return "down";
}

/** True when something between the touch and the sheet can still scroll back towards its start. */
function scrolledAway(target: Element, sheet: HTMLElement, direction: SwipeDirection): boolean {
	for (let node: Element | null = target; node && node !== sheet; node = node.parentElement) {
		if (direction === "down" && node.scrollTop > 0) return true;
		if (direction === "left" && node.scrollWidth > node.clientWidth && node.scrollLeft > 0) {
			return true;
		}
	}
	return direction === "down" && sheet.scrollTop > 0;
}

/**
 * Follow the finger, then let go the way a native sheet does. Touch events rather than pointer
 * events: the move handler must be able to stop the page scrolling once the swipe has taken
 * the gesture, which needs a non-passive `touchmove`.
 */
function attachSwipe(
	sheet: HTMLDialogElement,
	placement: () => SheetPlacement,
	onDismiss: () => void,
): void {
	let direction: SwipeDirection | null = null;
	let start = { x: 0, y: 0 };
	let locked = false;
	let tracking = false;
	let distance = 0;
	let samples: { at: number; distance: number }[] = [];

	const reset = () => {
		tracking = false;
		locked = false;
		distance = 0;
		samples = [];
	};

	sheet.addEventListener(
		"touchstart",
		(event) => {
			reset();
			if (event.touches.length !== 1) return;
			direction = swipeDirection(placement());
			const target = event.target as Element;
			if (!direction || target.closest(OWN_GESTURES)) return;
			if (scrolledAway(target, sheet, direction)) return;
			start = { x: event.touches[0].clientX, y: event.touches[0].clientY };
			tracking = true;
		},
		{ passive: true },
	);

	sheet.addEventListener(
		"touchmove",
		(event) => {
			if (!tracking || !direction) return;
			const dx = event.touches[0].clientX - start.x;
			const dy = event.touches[0].clientY - start.y;
			if (!locked) {
				if (Math.abs(dx) < SWIPE_SLOP_PX && Math.abs(dy) < SWIPE_SLOP_PX) return;
				// Commit only to a gesture heading out along the sheet's own axis; anything else is a
				// scroll or a tap and belongs to the content.
				const along =
					direction === "down" ? dy > 0 && dy > Math.abs(dx) : dx < 0 && -dx > Math.abs(dy);
				if (!along) {
					tracking = false;
					return;
				}
				locked = true;
				sheet.style.transition = "none";
			}
			event.preventDefault();
			distance = direction === "down" ? dy : -dx;
			const now = performance.now();
			samples.push({ at: now, distance });
			samples = samples.filter((sample) => now - sample.at < 100);
			const offset = followFinger(distance);
			sheet.style.translate = direction === "down" ? `0 ${offset}px` : `${-offset}px 0`;
		},
		{ passive: false },
	);

	const release = () => {
		if (!locked || !direction) {
			reset();
			return;
		}
		const first = samples[0];
		const last = samples.at(-1);
		const velocity =
			first && last && last.at > first.at
				? (last.distance - first.distance) / (last.at - first.at)
				: 0;
		const size = direction === "down" ? sheet.offsetHeight : sheet.offsetWidth;
		const dismiss = shouldDismiss({ distance, size, velocity });
		// Hand the motion back to CSS: from where the finger left it, either home or out.
		sheet.style.transition = "";
		sheet.style.translate = "";
		reset();
		if (dismiss) onDismiss();
	};
	sheet.addEventListener("touchend", release);
	sheet.addEventListener("touchcancel", release);
}

/**
 * A native modal `<dialog>` used for every sheet and drawer. `showModal()` supplies focus
 * trapping, Escape and an inert page; this adds backdrop-click dismissal, swipe-to-dismiss on
 * touch screens, and keeps `open` in sync with the element, so callers only own a boolean.
 */
export function Sheet(props: {
	open: boolean;
	onClose: () => void;
	label: string;
	placement?: SheetPlacement;
	children: JSX.Element;
}): JSX.Element {
	let dialog: HTMLDialogElement | undefined;
	const placement = () => props.placement ?? "bottom";

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
				attachSwipe(el, placement, () => props.onClose());
			}}
			aria-label={props.label}
			onClose={() => props.onClose()}
			onClick={(event) => {
				if (event.target === event.currentTarget) props.onClose();
			}}
			class={`bg-canvas p-0 text-ink transition-[translate,opacity,display,overlay] transition-discrete duration-slow ease-sheet backdrop:bg-black/40 ${PLACEMENT[placement()]}`}
		>
			{/* The grabber says "this can be pulled down"; touch screens only, where the gesture exists. */}
			<Show when={placement() !== "side"}>
				<div
					aria-hidden="true"
					class={`pointer-events-none absolute top-[calc(env(safe-area-inset-top)+0.375rem)] left-1/2 z-10 hidden h-1 w-9 -translate-x-1/2 rounded-full bg-ink/20 pointer-coarse:block ${placement() === "panel" ? "lg:hidden" : "md:hidden"}`}
				/>
			</Show>
			{props.children}
		</dialog>
	);
}
