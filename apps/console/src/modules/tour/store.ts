import { createSignal } from "solid-js";

/**
 * The feature tour: whether it is open, and whether this device has seen this edition of it.
 * Seen is kept per device; a new edition gets a new key, so it shows once more.
 */
export const TOUR_EDITION = "agent-threads-1";
const SEEN_KEY = `grid:feature-tour:${TOUR_EDITION}`;

const [open, setOpen] = createSignal(false);

function seen(): boolean {
	try {
		return localStorage.getItem(SEEN_KEY) === "seen";
	} catch {
		// Storage blocked (a private window): show it, and do not insist on remembering.
		return false;
	}
}

function markSeen(): void {
	try {
		localStorage.setItem(SEEN_KEY, "seen");
	} catch (cause) {
		console.warn("[tour] could not remember the tour was seen:", cause);
	}
}

export const tourStore = {
	open,
	seen,
	/** Show the tour, from the start. */
	show: () => setOpen(true),
	/** Close it; it counts as seen however it was closed (done, skipped, Escape). */
	close: () => {
		markSeen();
		setOpen(false);
	},
};
