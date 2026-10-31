import { localStore } from "@/lib/local-store";

/**
 * What was typed into a composer and not sent, kept on this device per thread (and per project's
 * new-thread composer), so closing the app, reloading or opening another chat does not lose it.
 * Kept per account and workspace, in localStorage so it is back in the field before the first
 * paint. Attachments are not kept: only the text.
 */

/** The most drafts kept: the oldest go first. */
const MAX_DRAFTS = 50;
/** A draft longer than this is kept cut short rather than not at all. */
const MAX_LENGTH = 20_000;

type Drafts = Record<string, { text: string; at: number }>;

function storageKey(): string | null {
	return localStore.storageKey("composer.drafts");
}

function readAll(): Drafts {
	const key = storageKey();
	if (!key) return {};
	try {
		const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "{}");
		return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Drafts) : {};
	} catch {
		// Blocked storage or a corrupt entry: start without drafts.
		return {};
	}
}

function writeAll(drafts: Drafts): void {
	const key = storageKey();
	if (!key) return;
	try {
		if (Object.keys(drafts).length === 0) localStorage.removeItem(key);
		else localStorage.setItem(key, JSON.stringify(drafts));
	} catch {
		// Storage can be blocked or full; the draft still stays in the field for this visit.
	}
}

export const composerDrafts = {
	/** The draft kept for a composer, or "" when there is none. */
	read(slot: string): string {
		const entry = readAll()[slot];
		return typeof entry?.text === "string" ? entry.text : "";
	},
	/** Keep a composer's text; an empty one removes its draft. */
	save(slot: string, text: string): void {
		const drafts = readAll();
		if (!text.trim()) {
			if (!(slot in drafts)) return;
			delete drafts[slot];
			writeAll(drafts);
			return;
		}
		drafts[slot] = { text: text.slice(0, MAX_LENGTH), at: Date.now() };
		const slots = Object.keys(drafts);
		if (slots.length > MAX_DRAFTS) {
			slots
				.sort((a, b) => (drafts[a]?.at ?? 0) - (drafts[b]?.at ?? 0))
				.slice(0, slots.length - MAX_DRAFTS)
				.forEach((old) => delete drafts[old]);
		}
		writeAll(drafts);
	},
	clear(slot: string): void {
		composerDrafts.save(slot, "");
	},
};
