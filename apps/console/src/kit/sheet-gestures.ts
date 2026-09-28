import { tap } from "./haptics";
import { followFinger, shouldDismiss, SWIPE_SLOP_PX, type SwipeDirection } from "./swipe";

// Controls that own their own drag: swiping on them must not move the sheet.
const OWN_GESTURES = 'input, textarea, select, [contenteditable="true"], [data-no-swipe]';

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
export function attachSwipe(
	sheet: HTMLDialogElement,
	direction: () => SwipeDirection | null,
	onDismiss: () => void,
): void {
	let heading: SwipeDirection | null = null;
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
			heading = direction();
			const target = event.target as Element;
			if (!heading || target.closest(OWN_GESTURES)) return;
			if (scrolledAway(target, sheet, heading)) return;
			start = { x: event.touches[0].clientX, y: event.touches[0].clientY };
			tracking = true;
		},
		{ passive: true },
	);

	sheet.addEventListener(
		"touchmove",
		(event) => {
			if (!tracking || !heading) return;
			const dx = event.touches[0].clientX - start.x;
			const dy = event.touches[0].clientY - start.y;
			if (!locked) {
				if (Math.abs(dx) < SWIPE_SLOP_PX && Math.abs(dy) < SWIPE_SLOP_PX) return;
				// Commit only to a gesture heading out along the sheet's own axis; anything else is a
				// scroll or a tap and belongs to the content.
				const along =
					heading === "down" ? dy > 0 && dy > Math.abs(dx) : dx < 0 && -dx > Math.abs(dy);
				if (!along) {
					tracking = false;
					return;
				}
				locked = true;
				sheet.style.transition = "none";
			}
			event.preventDefault();
			distance = heading === "down" ? dy : -dx;
			const now = performance.now();
			samples.push({ at: now, distance });
			samples = samples.filter((sample) => now - sample.at < 100);
			const offset = followFinger(distance);
			sheet.style.translate = heading === "down" ? `0 ${offset}px` : `${-offset}px 0`;
		},
		{ passive: false },
	);

	const release = () => {
		if (!locked || !heading) {
			reset();
			return;
		}
		const first = samples[0];
		const last = samples.at(-1);
		const velocity =
			first && last && last.at > first.at
				? (last.distance - first.distance) / (last.at - first.at)
				: 0;
		const size = heading === "down" ? sheet.offsetHeight : sheet.offsetWidth;
		const dismiss = shouldDismiss({ distance, size, velocity });
		// Hand the motion back to CSS: from where the finger left it, either home or out.
		sheet.style.transition = "";
		sheet.style.translate = "";
		reset();
		if (dismiss) {
			tap();
			onDismiss();
		}
	};
	sheet.addEventListener("touchend", release);
	sheet.addEventListener("touchcancel", release);
}
