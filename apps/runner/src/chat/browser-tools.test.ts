import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Browsers, readUrl } from "../browser/browsers";
import { browserSandbox, findBrowser, launchBrowser } from "../browser/cdp";
import { gridToolTitle } from "../agents/grid-titles";
import { browserTools } from "./browser-tools";
import type { ChatSessionRow } from "./store";

describe("starting the browser", () => {
	it("says why Chromium would not start, and how to run it without a sandbox", async () => {
		const dir = mkdtempSync(join(tmpdir(), "grid-fake-chrome-"));
		const fake = join(dir, "chrome");
		await Bun.write(
			fake,
			"#!/bin/sh\necho '[FATAL:zygote_host_impl_linux.cc] No usable sandbox!' >&2\nexit 1\n",
		);
		chmodSync(fake, 0o755);
		await expect(launchBrowser(fake, join(dir, "profile"))).rejects.toThrow(
			"GRID_BROWSER_NO_SANDBOX=1",
		);
		rmSync(dir, { recursive: true, force: true });
		expect(browserSandbox({ GRID_BROWSER_NO_SANDBOX: "1" })).toBe(false);
	});
});

describe("browser addresses", () => {
	it("open http(s) only, adding the scheme people leave out", () => {
		expect(readUrl("example.com")).toBe("https://example.com/");
		expect(readUrl("localhost:3000/a")).toBe("http://localhost:3000/a");
		expect(() => readUrl("file:///etc/passwd")).toThrow("Only http and https");
		expect(() => readUrl("javascript:alert(1)")).toThrow("Only http and https");
		expect(gridToolTitle("mcp__grid__browser_open", { url: "https://example.com" })).toBe(
			"Opened example.com in the browser",
		);
	});
});

// A real Chromium, where this machine has one: the protocol is the part worth proving.
const binary = findBrowser();
describe.skipIf(!binary)("browser tools", () => {
	const profile = mkdtempSync(join(tmpdir(), "grid-browser-"));
	// A local test page needs no sandbox, and CI machines often cannot give Chromium one.
	const browsers = new Browsers(profile, binary, false);
	const opened: string[] = [];
	const tools = new Map(
		browserTools(browsers, (_session, state) => opened.push(state.url)).map((tool) => [
			tool.name,
			tool,
		]),
	);
	const session = { id: "thread-1" } as ChatSessionRow;
	let server: ReturnType<typeof Bun.serve>;
	const run = async (name: string, args: Record<string, unknown> = {}) =>
		tools.get(name)?.run(session, args);

	beforeAll(() => {
		server = Bun.serve({
			port: 0,
			fetch: (request) =>
				new URL(request.url).pathname === "/next"
					? new Response("<title>Next</title><h1>Second page</h1>", {
							headers: { "content-type": "text/html" },
						})
					: new Response(
							`<title>Home</title><h1>Grid test</h1><a href="/next">Go next</a>
							<input placeholder="Name" id="n">
							<button onclick="document.title = 'Saved ' + document.getElementById('n').value">Save</button>`,
							{ headers: { "content-type": "text/html" } },
						),
		});
	});
	afterAll(() => {
		browsers.shutdown();
		server.stop();
		rmSync(profile, { recursive: true, force: true });
	});

	it("open a page, type and click by number, follow a link, go back and see it", async () => {
		const home = `http://localhost:${server.port}/`;
		const first = String(await run("browser_open", { url: home }));
		expect(first).toContain("Page: Home");
		expect(first).toContain('[1] link "Go next" -> /next');
		expect(first).toContain('[2] text field "Name"');
		expect(opened).toEqual([home]);

		await run("browser_type", { ref: 2, text: "Maya" });
		expect(String(await run("browser_click", { ref: 3 }))).toContain("Page: Saved Maya");

		expect(String(await run("browser_click", { ref: 1 }))).toContain("Second page");
		expect(opened.at(-1)).toBe(`${home}next`);
		expect(String(await run("browser_back"))).toContain("Grid test");

		const shot = await run("browser_screenshot");
		expect(typeof shot === "object" && shot.image?.mimeType).toBe("image/jpeg");
		expect(browsers.state("thread-1")).toMatchObject({ open: true, url: home });

		await browsers.close("thread-1");
		expect(browsers.state("thread-1").open).toBe(false);
	}, 60_000);
});

describe("browser routes", () => {
	it("answer only for this workspace's threads, and let only those who may start agents use it", async () => {
		const { browserRequest } = await import("./browser-routes");
		const { ChatError } = await import("./hub");
		const hub = {
			thread: (_workspace: string, id: string) => {
				if (id !== "mine") throw new ChatError("That chat does not exist", 404);
				return { id } as ChatSessionRow;
			},
		} as unknown as import("./hub").ChatHub;
		const browsers = new Browsers(join(tmpdir(), "unused"), null);
		const who = { userId: "u", workspace: "w" };
		const ask = (path: string, init?: RequestInit, as = who) =>
			browserRequest(
				new Request(`http://runner${path}`, init),
				new URL(`http://runner${path}`),
				as,
				hub,
				browsers,
			);

		expect((await ask("/chat/browser/theirs"))?.status).toBe(404);
		const state = await ask("/chat/browser/mine");
		expect(await state?.json()).toEqual({
			data: { available: false, open: false, url: "", title: "", version: 0 },
		});
		const viewer = { ...who, role: "viewer" as const };
		expect(
			(await ask("/chat/browser/mine/open", { method: "POST", body: "{}" }, viewer))?.status,
		).toBe(403);
		const noBrowser = await ask("/chat/browser/mine/open", {
			method: "POST",
			body: JSON.stringify({ url: "https://example.com" }),
		});
		expect(noBrowser?.status).toBe(501);
		expect(await ask("/chat/other")).toBeNull();
	});
});
