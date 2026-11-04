import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { OUTSIDE, resolveStart, SECTIONS } from "./active-workspace";

/** The first segment of every route the console declares, from `app.tsx` itself. */
function routeSegments(): string[] {
	const app = readFileSync(join(__dirname, "..", "app.tsx"), "utf8");
	const found = [...app.matchAll(/path:\s*"\/([a-z-]+)/g)].map((match) => match[1] ?? "");
	return [...new Set(found)].sort();
}

describe("links that name no workspace", () => {
	it("knows every page the console has, so none is taken for a workspace's name", () => {
		const unknown = routeSegments().filter(
			(segment) => !SECTIONS.has(segment) && !OUTSIDE.has(segment),
		);
		expect(unknown).toEqual([]);
	});

	it("opens a section's page in the current workspace, and a workspace's own URL in it", () => {
		for (const path of [
			"/pulls/grid?pr=12",
			"/ship/grid/env/prod",
			"/automations",
			"/home",
			"/inbox",
			"/team/r1",
		])
			expect(resolveStart(path, "acme")).toEqual({ inUrl: null, active: "acme", outside: false });
		expect(resolveStart("/shabir/board/grid", "acme")).toEqual({
			inUrl: "shabir",
			active: "shabir",
			outside: false,
		});
	});
});
