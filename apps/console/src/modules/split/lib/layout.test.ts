import { describe, expect, it } from "vitest";

import {
	activate,
	closeTab,
	defaultLayout,
	moveToOtherPane,
	normalize,
	openTab,
	RATIO,
	setMode,
	STACK,
	type SplitLayout,
	tabId,
} from "./layout";

const ids = (layout: SplitLayout) => layout.panes.map((pane) => pane.tabs.map(tabId));
const file = (path: string) => ({ kind: "file" as const, path });

describe("normalize", () => {
	it("starts a thread in Focus with a terminal and a preview ready", () => {
		const layout = normalize(null);
		expect(layout.mode).toBe("focus");
		expect(ids(layout)).toEqual([["terminal", "preview"]]);
		expect(layout.panes[0].active).toBe("terminal");
	});

	it("survives anything saved: wrong types, unknown tabs, ratios out of range", () => {
		const layout = normalize({
			mode: "sideways",
			ratio: 9,
			stack: -1,
			panes: [
				{ tabs: [{ kind: "bogus" }, { kind: "file", path: "" }, file("a.ts")], active: "nope" },
			],
		});
		expect(layout.mode).toBe("focus");
		expect(layout.ratio).toBe(RATIO.max);
		expect(layout.stack).toBe(STACK.min);
		expect(ids(layout)).toEqual([["file:a.ts"]]);
		expect(layout.panes[0].active).toBe("file:a.ts");
	});

	it("drops repeated tabs and keeps at most two panes", () => {
		const pane = { tabs: [{ kind: "terminal" }, { kind: "terminal" }], active: "terminal" };
		const layout = normalize({ mode: "split", panes: [pane, pane, pane] });
		expect(ids(layout)).toEqual([["terminal"], ["terminal"]]);
	});

	it("gives Three its second pane when a saved one lost it", () => {
		const layout = normalize({
			mode: "three",
			panes: [{ tabs: [{ kind: "terminal" }], active: "terminal" }],
		});
		expect(ids(layout)).toEqual([["terminal"], ["preview"]]);
	});
});

describe("modes", () => {
	it("splits the first pane's tabs into two for Three", () => {
		const three = setMode({ ...defaultLayout(), mode: "split" }, "three");
		expect(ids(three)).toEqual([["terminal"], ["preview"]]);
	});

	it("folds the second pane back in when leaving Three, losing nothing", () => {
		const three = openTab(setMode(defaultLayout(), "three"), file("a.ts"), 1);
		const split = setMode(three, "split");
		expect(ids(split)).toEqual([["terminal", "preview", "file:a.ts"]]);
		expect(split.panes[0].active).toBe("terminal");
	});
});

describe("tabs", () => {
	it("opens the workspace when a tab is opened from Focus", () => {
		const layout = openTab(defaultLayout(), file("src/app.ts"));
		expect(layout.mode).toBe("split");
		expect(layout.panes[0].active).toBe("file:src/app.ts");
	});

	it("brings an open tab forward where it is instead of opening it twice", () => {
		const three = setMode(defaultLayout(), "three");
		const layout = openTab(three, { kind: "preview" }, 0);
		expect(ids(layout)).toEqual([["terminal"], ["preview"]]);
		expect(layout.panes[1].active).toBe("preview");
	});

	it("shows the neighbour when the showing tab closes", () => {
		const layout = openTab(defaultLayout(), file("a.ts"));
		const closed = closeTab(layout, 0, "file:a.ts");
		expect(ids(closed)).toEqual([["terminal", "preview"]]);
		expect(closed.panes[0].active).toBe("preview");
	});

	it("goes back to Focus, with the default tabs, when the last tab closes", () => {
		let layout = activate(openTab(defaultLayout(), { kind: "terminal" }), 0, "terminal");
		layout = closeTab(layout, 0, "terminal");
		layout = closeTab(layout, 0, "preview");
		expect(layout.mode).toBe("focus");
		expect(ids(layout)).toEqual([["terminal", "preview"]]);
	});

	it("keeps the divider where it was when the workspace closes", () => {
		const layout = { ...openTab(defaultLayout(), { kind: "terminal" }), ratio: 0.6 };
		const closed = closeTab(closeTab(layout, 0, "terminal"), 0, "preview");
		expect(closed.ratio).toBe(0.6);
	});

	it("drops an emptied pane in Three and becomes Split", () => {
		const three = setMode(defaultLayout(), "three");
		const layout = closeTab(three, 1, "preview");
		expect(layout.mode).toBe("split");
		expect(ids(layout)).toEqual([["terminal"]]);
	});
});

describe("moving between panes", () => {
	it("splits a tab into a new pane, making Three", () => {
		const layout = moveToOtherPane({ ...defaultLayout(), mode: "split" }, 0, "preview");
		expect(layout.mode).toBe("three");
		expect(ids(layout)).toEqual([["terminal"], ["preview"]]);
	});

	it("will not split a pane's only tab away from it", () => {
		const one = closeTab({ ...defaultLayout(), mode: "split" }, 0, "preview");
		expect(moveToOtherPane(one, 0, "terminal")).toBe(one);
	});

	it("moves a tab across in Three, and merges back when its pane empties", () => {
		const three = setMode(defaultLayout(), "three");
		const moved = moveToOtherPane(three, 1, "preview");
		expect(moved.mode).toBe("split");
		expect(ids(moved)).toEqual([["terminal", "preview"]]);
		expect(moved.panes[0].active).toBe("preview");
	});
});
