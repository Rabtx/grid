import { describe, expect, it } from "vitest";

import {
	close,
	move,
	neighbour,
	open,
	ordered,
	others,
	rightOf,
	step,
	togglePin,
} from "./chat-tabs";

const base = { ids: ["a", "b", "c", "d"], pinned: ["c"] };

describe("chat tabs", () => {
	it("draw pinned tabs first and open new ones at the end", () => {
		expect(ordered(base)).toEqual(["c", "a", "b", "d"]);
		expect(ordered(open(base, "e"))).toEqual(["c", "a", "b", "d", "e"]);
		expect(open(base, "a")).toBe(base);
	});

	it("close others and to the right but leave pinned tabs open", () => {
		expect(others(base, "b")).toEqual(["a", "d"]);
		expect(rightOf(base, "a")).toEqual(["b", "d"]);
		expect(rightOf(base, "c")).toEqual(["a", "b", "d"]);
		expect(close(base, ["c", "a"])).toEqual({ ids: ["b", "d"], pinned: [] });
	});

	it("pin and unpin", () => {
		expect(ordered(togglePin(base, "d"))).toEqual(["c", "d", "a", "b"]);
		expect(togglePin(base, "c").pinned).toEqual([]);
	});

	it("move a tab, taking the pin state of where it lands", () => {
		expect(ordered(move(base, "d", "a", false))).toEqual(["c", "d", "a", "b"]);
		const pinnedNow = move(base, "b", "c", false);
		expect(pinnedNow.pinned).toEqual(["b", "c"]);
		const unpinned = move(base, "c", "d", true);
		expect(unpinned.pinned).toEqual([]);
		expect(ordered(unpinned)).toEqual(["a", "b", "d", "c"]);
	});

	it("find the neighbour and step round", () => {
		expect(neighbour(["a", "b", "c"], "b")).toBe("c");
		expect(neighbour(["a", "b", "c"], "c")).toBe("b");
		expect(neighbour(["a"], "a")).toBeNull();
		expect(neighbour(["a", "b", "c", "d"], "b", ["b", "c", "d"])).toBe("a");
		expect(step(["a", "b", "c"], "c", 1)).toBe("a");
		expect(step(["a", "b", "c"], "a", -1)).toBe("c");
		expect(step(["a", "b"], null, -1)).toBe("b");
	});
});
