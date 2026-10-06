import { createSignal } from "solid-js";

import { accountStorage } from "@/lib/account-storage";

import { normalize, type SplitLayout } from "../lib/layout";

const layoutKey = (thread: string) => `grid.split.${thread}`;

// Read once per thread per visit, then kept here: every pane and the title bar switch read the
// same copy, so they can never disagree.
const [layouts, setLayouts] = createSignal<Record<string, SplitLayout>>({});

function read(thread: string): SplitLayout {
	try {
		const saved = accountStorage.get(layoutKey(thread));
		return normalize(saved ? JSON.parse(saved) : null);
	} catch {
		// A damaged entry starts the thread over in Focus rather than breaking it.
		return normalize(null);
	}
}

/** Each thread's split view, remembered on this device for the account and workspace. */
export const layoutsStore = {
	of(thread: string): SplitLayout {
		return layouts()[thread] ?? read(thread);
	},
	/** Apply a change and remember it. */
	update(thread: string, change: (layout: SplitLayout) => SplitLayout): void {
		const next = change(layouts()[thread] ?? read(thread));
		setLayouts((all) => ({ ...all, [thread]: next }));
		accountStorage.set(layoutKey(thread), JSON.stringify(next));
	},
	/** Change without saving: while a divider is dragged, saved once it is let go. */
	preview(thread: string, change: (layout: SplitLayout) => SplitLayout): void {
		const next = change(layouts()[thread] ?? read(thread));
		setLayouts((all) => ({ ...all, [thread]: next }));
	},
	save(thread: string): void {
		const current = layouts()[thread];
		if (current) accountStorage.set(layoutKey(thread), JSON.stringify(current));
	},
	/** A deleted thread's layout goes with it. */
	forget(thread: string): void {
		setLayouts((all) => {
			const next = { ...all };
			delete next[thread];
			return next;
		});
		accountStorage.delete(layoutKey(thread));
	},
};
