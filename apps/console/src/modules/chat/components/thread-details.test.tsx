import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";

import { ThreadDetails, type ThreadDetailsData } from "./thread-details";

const base: ThreadDetailsData = {
	agent: { id: "claude", name: "Claude Code", model: "Opus 5.5" },
	started: "Started 3 hours ago",
	machine: "This machine",
	folder: "/repo/apps/console",
	workedMs: 72_000,
	files: [],
	added: 0,
	removed: 0,
};

describe("ThreadDetails", () => {
	let dispose: (() => void) | undefined;
	afterEach(() => {
		dispose?.();
		document.body.replaceChildren();
	});

	function mount(data: ThreadDetailsData): HTMLElement {
		const host = document.createElement("div");
		document.body.append(host);
		dispose = render(() => <ThreadDetails data={data} />, host);
		flush();
		return host;
	}

	const sections = (host: HTMLElement) =>
		[...host.querySelectorAll("section h3")].map((heading) => heading.textContent);

	it("says who works, where, and that nothing has changed yet", () => {
		const host = mount(base);
		expect(sections(host)).toEqual(["Agent", "Workspace", "Changes"]);
		expect(host.textContent).toContain("Claude Code");
		expect(host.textContent).toContain("Opus 5.5");
		expect(host.textContent).toContain("1m 12s");
		// The folder is cut to its last two parts; the full path is its title.
		expect(host.querySelector('[title="/repo/apps/console"]')?.textContent).toContain(
			"apps/console",
		);
		expect(host.textContent).toContain("No files changed yet.");
	});

	it("lists changed files, usage and where it was forked from, when there are any", () => {
		const host = mount({
			...base,
			branch: "grid/fix-auth",
			files: [{ path: "src/auth/session.ts", added: 12, removed: 3 }],
			added: 12,
			removed: 3,
			usage: {
				contextUsed: 152_000,
				contextWindow: 200_000,
				inputTokens: 9_000,
				outputTokens: 2_000,
			},
			forkedFrom: { title: "Plan the release", href: "/chat/demo/abc" },
		});
		expect(sections(host)).toEqual(["Agent", "Workspace", "Changes", "Usage", "Related"]);
		expect(host.textContent).toContain("grid/fix-auth");
		expect(host.textContent).toContain("auth/session.ts");
		expect(host.textContent).toContain("152k / 200k");
		expect(host.textContent).toContain("9k in · 2k out");
		expect(host.querySelector('a[href="/chat/demo/abc"]')?.textContent).toContain(
			"Plan the release",
		);
	});
});
