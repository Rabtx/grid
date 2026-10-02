import { describe, expect, it } from "vitest";

import { code, link, markLines, mention, wrap } from "./note-edit";

const at = (text: string, start: number, end = start) => ({ text, start, end });

describe("the note's format bar", () => {
	it("wraps the selection in marks, or takes them off", () => {
		expect(wrap(at("make bold", 5, 9), "**", "**", "bold")).toEqual(at("make **bold**", 7, 11));
		expect(wrap(at("make **bold**", 7, 11), "**", "**", "bold")).toEqual(at("make bold", 5, 9));
		expect(wrap(at("", 0), "_", "_", "italic")).toEqual(at("_italic_", 1, 7));
	});

	it("starts lines as a list, a task or a heading, and toggles them back", () => {
		expect(markLines(at("", 0), "- [ ] ")).toEqual(at("- [ ] ", 6));
		expect(markLines(at("one\ntwo\nthree", 2, 6), "- ").text).toBe("- one\n- two\nthree");
		expect(markLines(at("- one\n- two", 0, 11), "- ").text).toBe("one\ntwo");
		// A bullet becomes a task rather than gaining a second mark.
		expect(markLines(at("- one", 3), "- [ ] ")).toEqual(at("- [ ] one", 7));
		expect(markLines(at("## Head", 4), "").text).toBe("Head");
		expect(markLines(at("Head", 0), "## ").text).toBe("## Head");
	});

	it("makes code, links and file mentions", () => {
		expect(code(at("run it", 4, 6))).toEqual(at("run `it`", 5, 7));
		expect(code(at("a\nb", 0, 3))).toEqual(at("```\na\nb\n```\n", 4, 7));
		expect(link(at("see docs", 4, 8))).toEqual(at("see [docs](https://)", 11, 19));
		expect(mention(at("in", 2), "src/a.ts")).toEqual(at("in `src/a.ts` ", 14));
		expect(mention(at("in  x", 3), "a.ts")).toEqual(at("in `a.ts` x", 9));
	});
});
