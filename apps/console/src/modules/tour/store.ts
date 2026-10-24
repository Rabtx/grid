import { createSignal } from "solid-js";

import { TOUR_SLIDES, type TourSlide } from "./content";

/**
 * The feature tour: whether it is open, which slides it shows, and which editions this device has
 * seen. Each slide belongs to an edition; an edition seen here is kept per device, so a new one
 * shows once more, with only its own slides. Replaying shows every slide.
 */
const seenKey = (edition: string) => `grid:feature-tour:${edition}`;

const [open, setOpen] = createSignal(false);
const [slides, setSlides] = createSignal<TourSlide[]>(TOUR_SLIDES);

function wasSeen(edition: string): boolean {
	try {
		return localStorage.getItem(seenKey(edition)) === "seen";
	} catch {
		// Storage blocked (a private window): show it, and do not insist on remembering.
		return false;
	}
}

function markSeen(edition: string): void {
	try {
		localStorage.setItem(seenKey(edition), "seen");
	} catch (cause) {
		console.warn("[tour] could not remember the tour was seen:", cause);
	}
}

/** The slides of editions this device has not seen. */
function unseen(): TourSlide[] {
	return TOUR_SLIDES.filter((slide) => !wasSeen(slide.edition));
}

export const tourStore = {
	open,
	/** The slides showing: what is new to this device, or all of them on a replay. */
	slides,
	/** Whether this device has seen every edition. */
	seen: () => unseen().length === 0,
	/** Show what this device has not seen yet; nothing when it has seen it all. */
	showNew: () => {
		const fresh = unseen();
		if (!fresh.length) return;
		setSlides(fresh);
		setOpen(true);
	},
	/** Show every slide, from the start (Settings → General → What's new). */
	show: () => {
		setSlides(TOUR_SLIDES);
		setOpen(true);
	},
	/** Close it; every edition it showed counts as seen however it closed (done, skipped, Escape). */
	close: () => {
		for (const edition of new Set(slides().map((slide) => slide.edition))) markSeen(edition);
		setOpen(false);
	},
};
