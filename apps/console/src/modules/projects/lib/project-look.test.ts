import { describe, expect, it } from "vitest";

import { mascotPath, PROJECT_MASCOTS, parseProjectIcon, projectColor } from "./project-look";

describe("project look", () => {
	it("uses the chosen colour, and otherwise a stable one picked from the slug", () => {
		expect(projectColor({ slug: "grid", color: "#ff0000" })).toBe("#ff0000");
		expect(projectColor({ slug: "grid", color: "blue" })).toContain("212");
		expect(projectColor({ slug: "grid" })).toBe(projectColor({ slug: "grid", color: null }));
		expect(projectColor({ slug: "grid" })).not.toContain("215 12%");
	});

	it("reads stored icons and falls back to the folder", () => {
		expect(parseProjectIcon("symbol:rocket")).toEqual({ kind: "symbol", id: "rocket" });
		expect(parseProjectIcon("mascot:robot")).toEqual({ kind: "mascot", id: "robot" });
		expect(parseProjectIcon("letter")).toEqual({ kind: "letter" });
		expect(parseProjectIcon("symbol:nope")).toEqual({ kind: "folder" });
		expect(parseProjectIcon(null)).toEqual({ kind: "folder" });
	});

	it("draws every mascot frame as 8×8 pixels", () => {
		for (const { rest, busy } of Object.values(PROJECT_MASCOTS)) {
			for (const frame of [rest, busy]) {
				expect(frame).toHaveLength(8);
				expect(frame.every((row) => row.length === 8)).toBe(true);
				expect(mascotPath(frame)).toMatch(/^M\d/);
			}
		}
	});
});
