/**
 * A project's open chat tabs as plain lists: the ids in the order they sit, and which are pinned.
 * Pinned tabs always come first; "close others" and "close to the right" leave them open.
 */
export type TabState = { ids: readonly string[]; pinned: readonly string[] };

/** The tabs as they are drawn: pinned first, each group in its own order. */
export function ordered(state: TabState): string[] {
	const pinned = new Set(state.pinned);
	return [
		...state.ids.filter((id) => pinned.has(id)),
		...state.ids.filter((id) => !pinned.has(id)),
	];
}

export function open(state: TabState, id: string): TabState {
	return state.ids.includes(id) ? state : { ...state, ids: [...state.ids, id] };
}

export function close(state: TabState, ids: readonly string[]): TabState {
	const gone = new Set(ids);
	return {
		ids: state.ids.filter((id) => !gone.has(id)),
		pinned: state.pinned.filter((id) => !gone.has(id)),
	};
}

/** The tabs "close others" closes: every unpinned tab but this one. */
export function others(state: TabState, keep: string): string[] {
	return ordered(state).filter((id) => id !== keep && !state.pinned.includes(id));
}

/** The tabs "close to the right" closes: the unpinned ones after this one. */
export function rightOf(state: TabState, of: string): string[] {
	const list = ordered(state);
	const index = list.indexOf(of);
	if (index === -1) return [];
	return list.slice(index + 1).filter((id) => !state.pinned.includes(id));
}

export function togglePin(state: TabState, id: string): TabState {
	if (!state.ids.includes(id)) return state;
	return state.pinned.includes(id)
		? { ...state, pinned: state.pinned.filter((item) => item !== id) }
		: { ...state, pinned: [...state.pinned, id] };
}

/**
 * Move a tab before (or after) another. A tab dropped across the pinned edge takes the pin state
 * of where it lands, as a browser's tab strip does.
 */
export function move(state: TabState, id: string, target: string, after: boolean): TabState {
	if (id === target || !state.ids.includes(id) || !state.ids.includes(target)) return state;
	const list = ordered(state).filter((item) => item !== id);
	const at = list.indexOf(target) + (after ? 1 : 0);
	list.splice(at, 0, id);
	const pinnedTarget = state.pinned.includes(target);
	const pinned = pinnedTarget
		? state.pinned.includes(id)
			? state.pinned
			: [...state.pinned, id]
		: state.pinned.filter((item) => item !== id);
	const pinnedSet = new Set(pinned);
	// Pinned order follows the strip too.
	return { ids: list, pinned: list.filter((item) => pinnedSet.has(item)) };
}

/**
 * Where to go when tabs close with this one among them: the nearest open tab to its right, else
 * to its left, else nowhere.
 */
export function neighbour(
	list: readonly string[],
	id: string,
	closing: readonly string[] = [id],
): string | null {
	const index = list.indexOf(id);
	if (index === -1) return null;
	const open = (item: string) => !closing.includes(item);
	return list.slice(index + 1).find(open) ?? list.slice(0, index).reverse().find(open) ?? null;
}

/** The tab `by` steps away from `id`, wrapping round. */
export function step(list: readonly string[], id: string | null, by: number): string | null {
	if (!list.length) return null;
	const index = id ? list.indexOf(id) : -1;
	if (index === -1) return by > 0 ? (list[0] ?? null) : (list.at(-1) ?? null);
	return list[(index + by + list.length) % list.length] ?? null;
}
