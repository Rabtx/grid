/**
 * A thread's split view, kept as plain data so it can be saved per thread and checked on load.
 *
 * Focus is the thread alone. Split puts one workspace pane beside it; Three stacks two. Each pane
 * holds tabs: the thread's terminal, a preview of what that terminal serves, or a file.
 */

export type SplitMode = "focus" | "split" | "three";

export type PaneTab = { kind: "terminal" } | { kind: "preview" } | { kind: "file"; path: string };

export type Pane = {
	tabs: PaneTab[];
	/** The id (`tabId`) of the tab showing. */
	active: string;
};

export type SplitLayout = {
	mode: SplitMode;
	/** The thread's share of the width beside the workspace, from `RATIO.min` to `RATIO.max`. */
	ratio: number;
	/** The top pane's share of the height in Three, from `STACK.min` to `STACK.max`. */
	stack: number;
	/** One pane for Split, a second under it for Three. Three always has both. */
	panes: Pane[];
};

/** How narrow either side can be dragged: the thread and the workspace each stay usable. */
export const RATIO = { min: 0.35, max: 0.72, initial: 0.45 } as const;
export const STACK = { min: 0.25, max: 0.75, initial: 0.5 } as const;

export const MODES: readonly SplitMode[] = ["focus", "split", "three"];

export function tabId(tab: PaneTab): string {
	return tab.kind === "file" ? `file:${tab.path}` : tab.kind;
}

const TERMINAL: PaneTab = { kind: "terminal" };
const PREVIEW: PaneTab = { kind: "preview" };

export function defaultLayout(): SplitLayout {
	return {
		mode: "focus",
		ratio: RATIO.initial,
		stack: STACK.initial,
		panes: [{ tabs: [TERMINAL, PREVIEW], active: "terminal" }],
	};
}

const clamp = (value: number, range: { min: number; max: number }) =>
	Math.min(range.max, Math.max(range.min, value));

export function clampRatio(value: number): number {
	return clamp(value, RATIO);
}

export function clampStack(value: number): number {
	return clamp(value, STACK);
}

function readTab(value: unknown): PaneTab | null {
	if (!value || typeof value !== "object") return null;
	const tab = value as Record<string, unknown>;
	if (tab.kind === "terminal") return TERMINAL;
	if (tab.kind === "preview") return PREVIEW;
	if (tab.kind === "file" && typeof tab.path === "string" && tab.path.trim())
		return { kind: "file", path: tab.path };
	return null;
}

function readPane(value: unknown): Pane | null {
	if (!value || typeof value !== "object") return null;
	const raw = value as Record<string, unknown>;
	const tabs = (Array.isArray(raw.tabs) ? raw.tabs : [])
		.map(readTab)
		.filter((tab): tab is PaneTab => tab !== null);
	const unique = tabs.filter(
		(tab, index) => tabs.findIndex((other) => tabId(other) === tabId(tab)) === index,
	);
	if (unique.length === 0) return null;
	const active = unique.some((tab) => tabId(tab) === raw.active)
		? (raw.active as string)
		: tabId(unique[0]);
	return { tabs: unique, active };
}

/**
 * A saved layout made safe to use: anything missing, out of range or from an older shape falls
 * back to its default rather than breaking the screen.
 */
export function normalize(value: unknown): SplitLayout {
	const fallback = defaultLayout();
	if (!value || typeof value !== "object") return fallback;
	const raw = value as Record<string, unknown>;
	const mode = MODES.includes(raw.mode as SplitMode) ? (raw.mode as SplitMode) : fallback.mode;
	const ratio =
		typeof raw.ratio === "number" && Number.isFinite(raw.ratio) ? raw.ratio : RATIO.initial;
	const stack =
		typeof raw.stack === "number" && Number.isFinite(raw.stack) ? raw.stack : STACK.initial;
	const panes = (Array.isArray(raw.panes) ? raw.panes : [])
		.map(readPane)
		.filter((pane): pane is Pane => pane !== null)
		.slice(0, 2);
	return withPanes({
		mode,
		ratio: clampRatio(ratio),
		stack: clampStack(stack),
		panes: panes.length ? panes : fallback.panes,
	});
}

/** Three needs a second pane: one is made from the first pane's other tabs, or a preview. */
function withPanes(layout: SplitLayout): SplitLayout {
	if (layout.mode !== "three" || layout.panes.length >= 2) return layout;
	const [first] = layout.panes;
	const spare = first.tabs.find((tab) => tabId(tab) !== first.active);
	if (spare && first.tabs.length > 1) {
		const rest = first.tabs.filter((tab) => tab !== spare);
		return {
			...layout,
			panes: [
				{ tabs: rest, active: first.active },
				{ tabs: [spare], active: tabId(spare) },
			],
		};
	}
	const second = first.active === "preview" ? TERMINAL : PREVIEW;
	return { ...layout, panes: [first, { tabs: [second], active: tabId(second) }] };
}

/**
 * Switch mode. Leaving Three folds the second pane's tabs back into the first, so nothing opened
 * there is lost.
 */
export function setMode(layout: SplitLayout, mode: SplitMode): SplitLayout {
	if (mode === "three") return withPanes({ ...layout, mode });
	if (layout.panes.length < 2) return { ...layout, mode };
	const [first, second] = layout.panes;
	const tabs = [...first.tabs];
	for (const tab of second.tabs) if (!tabs.some((t) => tabId(t) === tabId(tab))) tabs.push(tab);
	return { ...layout, mode, panes: [{ tabs, active: first.active }] };
}

/** Where a tab already is: its pane's index, or -1. */
export function paneOf(layout: SplitLayout, id: string): number {
	return layout.panes.findIndex((pane) => pane.tabs.some((tab) => tabId(tab) === id));
}

/**
 * Show a tab, opening the workspace if it was in Focus. A tab already open is brought forward
 * where it is; a new one goes into `pane` (the first, unless given and present).
 */
export function openTab(layout: SplitLayout, tab: PaneTab, pane = 0): SplitLayout {
	const id = tabId(tab);
	const mode = layout.mode === "focus" ? "split" : layout.mode;
	const opened = withPanes({ ...layout, mode });
	const where = paneOf(opened, id);
	const target = where >= 0 ? where : Math.min(pane, opened.panes.length - 1);
	const panes = opened.panes.map((current, index) =>
		index !== target
			? current
			: {
					tabs: where >= 0 ? current.tabs : [...current.tabs, tab],
					active: id,
				},
	);
	return { ...opened, panes };
}

export function activate(layout: SplitLayout, pane: number, id: string): SplitLayout {
	return {
		...layout,
		panes: layout.panes.map((current, index) =>
			index === pane && current.tabs.some((tab) => tabId(tab) === id)
				? { ...current, active: id }
				: current,
		),
	};
}

/**
 * Close a tab. The pane shows its neighbour; a pane left empty goes, and with no pane left the
 * thread is back in Focus (with the default tabs ready for next time).
 */
export function closeTab(layout: SplitLayout, pane: number, id: string): SplitLayout {
	const current = layout.panes[pane];
	if (!current) return layout;
	const index = current.tabs.findIndex((tab) => tabId(tab) === id);
	if (index < 0) return layout;
	const tabs = current.tabs.filter((_, i) => i !== index);
	if (tabs.length > 0) {
		const neighbour = tabs[index] ?? tabs[index - 1];
		const active = current.active === id ? tabId(neighbour) : current.active;
		return {
			...layout,
			panes: layout.panes.map((p, i) => (i === pane ? { tabs, active } : p)),
		};
	}
	const panes = layout.panes.filter((_, i) => i !== pane);
	if (panes.length === 0) return { ...defaultLayout(), ratio: layout.ratio, stack: layout.stack };
	return { ...layout, mode: layout.mode === "three" ? "split" : layout.mode, panes };
}

/**
 * Move a tab into the other pane, making Three if there was only one: the drag-to-split gesture
 * and the tab menu's "Move to other pane".
 */
export function moveToOtherPane(layout: SplitLayout, from: number, id: string): SplitLayout {
	const source = layout.panes[from];
	const tab = source?.tabs.find((t) => tabId(t) === id);
	if (!source || !tab) return layout;
	if (layout.panes.length === 1) {
		if (source.tabs.length === 1) return layout;
		const rest = source.tabs.filter((t) => t !== tab);
		const active = source.active === id ? tabId(rest[0]) : source.active;
		return {
			...layout,
			mode: "three",
			panes: [
				{ tabs: rest, active },
				{ tabs: [tab], active: id },
			],
		};
	}
	const to = from === 0 ? 1 : 0;
	const removed = closeTab(layout, from, id);
	// Closing may have dropped the source pane: the target is then the only one left.
	const target = removed.panes.length === 1 ? 0 : to;
	return openTab(removed, tab, target);
}
