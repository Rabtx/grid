import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The router's history adds the workspace to every path it is given (lib/workspace-history.ts).
 * A path that already carries it — `navigate(workspaceHref("/settings"))` — ends up with it twice
 * (`/shabir/shabir/settings`), a page that is not found. `workspaceHref` is for links (`href`),
 * which the router does not rewrite; `navigate` takes the bare path.
 */
const ROOT = join(__dirname, "..");

function sources(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return sources(path);
		return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
	});
}

describe("navigate", () => {
	it("is never handed a path that already carries the workspace", () => {
		const offenders = sources(ROOT).flatMap((file) =>
			readFileSync(file, "utf8")
				.split("\n")
				.map((line, index) => ({ line, index }))
				.filter(({ line }) => /navigate\(\s*workspaceHref\(/.test(line))
				.map(({ index }) => `${relative(ROOT, file)}:${index + 1}`),
		);
		expect(offenders).toEqual([]);
	});
});
