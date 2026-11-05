import { createSignal } from "solid-js";

/**
 * Where a pick from the split chooser opens: beside the thread (opening the split), in a new pane
 * below the first, or in pane `n` (its + button).
 */
export type ChooserWhere = "beside" | "below" | number;

export type ChooserRequest = { thread: string; where: ChooserWhere };

const [request, setRequest] = createSignal<ChooserRequest | null>(null);

/** The split chooser: one open at a time, for one thread, saying where the pick will go. */
export const splitChooser = {
	request,
	open: (thread: string, where: ChooserWhere) => setRequest({ thread, where }),
	close: () => setRequest(null),
};
