import { describe, expect, it } from "vitest";
import { POST_BODIES } from "../posts";
import { CHEAT_SHEET_ROWS } from "./cheat-sheet.data";
import { formatPostDate, getPost, POSTS } from "./posts.data";

describe("blog posts", () => {
	it("gives every post a unique kebab-case slug and a body", () => {
		const slugs = POSTS.map((post) => post.slug);
		expect(new Set(slugs).size).toBe(slugs.length);
		for (const slug of slugs) {
			expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
			expect(POST_BODIES[slug]).toBeDefined();
		}
	});

	it("lists posts newest first with real dates", () => {
		const dates = POSTS.map((post) => post.published);
		for (const date of dates) expect(Number.isNaN(Date.parse(date))).toBe(false);
		expect([...dates].sort().reverse()).toEqual(dates);
	});

	it("finds a post by slug and nothing for an unknown one", () => {
		expect(getPost("ui-ux-design-in-the-ai-era")?.title).toContain("AI era");
		expect(getPost("missing")).toBeUndefined();
	});

	it("prints the same day everywhere", () => {
		expect(formatPostDate("2026-10-12")).toBe("12 October 2026");
	});
});

describe("ui cheat sheet", () => {
	it("prints the exact published numbers", () => {
		const spec = Object.fromEntries(CHEAT_SHEET_ROWS.map((row) => [row.id, row.spec]));
		expect(spec.type).toBe(
			"Inter, 16/20px Medium titles, 13/16px Medium labels, 14px Regular body",
		);
		expect(spec.buttons).toBe("32px height, 10px radius");
		expect(spec.rows).toBe("40px data, 44px stores");
		expect(spec.badge).toBe("20px height, 6px radius, #CAFACE fill, #15B042 text");
		expect(spec.switch).toBe("24×14px, 10px thumb, #0077E6 track");
		expect(spec.text).toBe("#333333 default, #777777 subtle");
	});
});
