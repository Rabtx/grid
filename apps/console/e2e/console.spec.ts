import { readFileSync } from "node:fs";
import { join } from "node:path";

import { type Browser, expect, type Page, test } from "@playwright/test";

/**
 * The console end to end, against the real API and runner with a stand-in agent (`stack.ts`):
 * first-run setup, threads, thread links, snooze, sharing with a guest, agent keys over MCP and
 * webhook automations. One Grid for the whole file, so the tests run in order and build on each
 * other.
 */

const STACK = join(import.meta.dirname, "..", ".e2e-stack");
const PROJECTS_DIR = join(STACK, "runner", "projects");
const OWNER = {
	name: "Maya Chen",
	email: "maya@example.com",
	password: "Grid-e2e-passphrase-2026",
};

test.describe.configure({ mode: "serial" });

let page: Page;
/** The signed-in person's bearer token and workspace, as the console sends them to the runner. */
const auth: { token: string; workspace: string } = { token: "", workspace: "" };
const threads: { first: string } = { first: "" };
/** Errors the console threw: none is the only right number. */
const errors: string[] = [];

test.afterEach(() => {
	expect(errors.splice(0)).toEqual([]);
});

async function dismissTour(on: Page): Promise<void> {
	for (let i = 0; i < 3; i++) {
		if (!(await on.locator('dialog[open][aria-label="New in Grid"]').count())) return;
		await on.keyboard.press("Escape");
	}
}

/** A call the console would make, with the person's token. */
async function call(path: string, init: { method?: string; body?: unknown } = {}) {
	return page.evaluate(
		async ({ path, init, auth }) => {
			const response = await fetch(path, {
				method: init.method ?? "GET",
				headers: {
					authorization: auth.token,
					"x-grid-workspace": auth.workspace,
					"content-type": "application/json",
				},
				...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
			});
			return { status: response.status, body: await response.json().catch(() => null) };
		},
		{ path, init, auth },
	);
}

/** A thread's row in the sidebar, and its menu opened. */
async function threadMenu(id: string): Promise<void> {
	// A click that lands while the page is still settling opens nothing: try again until it does.
	await expect(async () => {
		await page.locator(`a[href$="/${id}"]`).first().click({ button: "right" });
		await expect(page.getByRole("menuitem").first()).toBeVisible({ timeout: 2_000 });
	}).toPass({ timeout: 15_000 });
}

async function send(text: string): Promise<void> {
	const box = page.getByPlaceholder(/Ask, build/);
	await box.fill(text);
	await box.press("Enter");
}

test.beforeAll(async ({ browser }: { browser: Browser }) => {
	page = await browser.newPage();
	// The feature tour opens on its own a moment after a page loads: these tests have seen it.
	await page.addInitScript(() => {
		const read = Storage.prototype.getItem;
		Storage.prototype.getItem = function (key: string) {
			return key.startsWith("grid:feature-tour:") ? "seen" : read.call(this, key);
		};
	});
	page.on("pageerror", (error) => errors.push(`${error.message}\n${error.stack ?? ""}`));
	page.on("console", (message) => {
		if (message.type() === "error" && /is not a function|undefined|null/.test(message.text()))
			errors.push(message.text());
	});
	page.on("request", (request) => {
		const headers = request.headers();
		if (!request.url().includes("/runner/")) return;
		if (headers.authorization) auth.token = headers.authorization;
		if (headers["x-grid-workspace"]) auth.workspace = headers["x-grid-workspace"];
	});
});

test("sets Grid up on first run, through to its first agent", async () => {
	await page.goto(readFileSync(join(STACK, "setup-link.txt"), "utf8").trim());
	await page.getByPlaceholder("Your name").fill(OWNER.name);
	await page.getByPlaceholder("you@company.com").fill(OWNER.email);
	await page.getByPlaceholder("At least 12 characters").fill(OWNER.password);
	await page.getByRole("button", { name: "Continue" }).click();
	await page.getByPlaceholder("Acme").fill("Acme");
	await page.getByRole("button", { name: "Continue" }).click();
	await expect(page.getByText("Connect a machine")).toBeVisible();
	await page.getByRole("button", { name: "Continue" }).click();
	await page.getByRole("button", { name: "Continue with Claude Code" }).click();
	await expect(page).toHaveURL(/\/acme\/chat/);
	await dismissTour(page);
	await expect.poll(() => auth.token).not.toBe("");
});

test("links a project folder and starts a thread the agent answers", async () => {
	expect(
		(
			await call("/api/v1/workspaces/acme/projects", {
				method: "POST",
				body: { slug: "demo", name: "Demo" },
			})
		).status,
	).toBe(201);
	const linked = await call("/runner/projects/folders/demo", {
		method: "PUT",
		body: { path: join(PROJECTS_DIR, "demo") },
	});
	expect(linked.status).toBeLessThan(300);
	await page.goto("/acme/chat/demo");
	await dismissTour(page);
	await send("hello there");
	await expect(page.getByText(/ok: .*hello there/)).toBeVisible();
	await expect(page).toHaveURL(/\/acme\/chat\/demo\/[\w-]+$/);
	threads.first = page.url().split("/").pop() ?? "";
});

test("opens a thread an agent links to", async () => {
	await page.goto("/acme/chat/demo");
	await send(`LINK:${threads.first}`);
	const link = page.getByRole("link", { name: "the earlier thread" });
	await expect(link).toBeVisible();
	await link.click();
	await expect(page).toHaveURL(new RegExp(`/acme/chat/demo/${threads.first}$`));
});

test("snoozes a thread from its menu, and wakes it", async () => {
	await threadMenu(threads.first);
	await page.getByRole("menuitem", { name: "Snooze for an hour" }).click();
	const marker = page.locator("span[title^='Snoozed until']");
	await expect(marker).toBeVisible();
	await threadMenu(threads.first);
	await page.getByRole("menuitem", { name: "Wake" }).click();
	await expect(marker).toHaveCount(0);
});

test("shares a thread with a guest, who asks, and sees the answer once sent on", async ({
	browser,
}) => {
	await page.goto(`/acme/chat/demo/${threads.first}`);
	await dismissTour(page);
	await threadMenu(threads.first);
	await page.getByRole("menuitem", { name: /Share with a guest/ }).click();
	const field = page.getByLabel("guest link", { exact: true });
	await expect(field).toHaveValue(/\/guest\/grid_gl_/);
	const link = await field.inputValue();
	await page.getByRole("button", { name: "Done" }).click();

	// A guest on a phone, signed in to nothing.
	const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
	const guest = await guestContext.newPage();
	await guest.goto(link);
	await expect(guest.getByText("hello there").first()).toBeVisible();
	expect(
		await guest.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
	).toBe(true);
	await guest.getByLabel("Your name").fill("Dana");
	await guest.getByLabel("Ask something").fill("Is it ready for Friday?");
	await guest.getByRole("button", { name: "Ask" }).click();
	await expect(guest.getByText("Dana · waiting for the thread's person")).toBeVisible();

	// The thread's person sends it on; the agent answers it.
	await expect(page.getByText("Dana, a guest, asks")).toBeVisible();
	await page.getByRole("button", { name: "Send to the agent" }).click();
	await expect(page.getByText(/ok: .*ready for Friday/)).toBeVisible();
	await expect(guest.getByText("Dana · sent to the agent")).toBeVisible({ timeout: 15_000 });
	await expect(guest.getByText(/ok: .*ready for Friday/)).toBeVisible({ timeout: 15_000 });

	// Stopping sharing ends the link.
	expect(
		(await call(`/runner/chat/sessions/${threads.first}/guest-links`, { method: "DELETE" })).status,
	).toBe(204);
	await expect(guest.getByText("This link has ended")).toBeVisible({ timeout: 15_000 });
	await guestContext.close();
});

test("makes an agent key that an outside agent uses over MCP, and revokes it", async () => {
	await page.goto("/acme/settings/agent-keys");
	await page.getByRole("button", { name: "New key" }).click();
	await page.getByPlaceholder("Claude Desktop").fill("Cursor");
	await page.getByRole("switch", { name: "Can start and steer threads" }).click();
	await page.getByRole("button", { name: "Expires" }).click();
	await page.getByRole("button", { name: "30 days", exact: true }).click();
	await page.getByLabel("Budget for 30 days (USD)").fill("5");
	await page.getByRole("switch", { name: "Only threads it starts" }).click();
	await page.getByRole("button", { name: "Make key" }).click();
	const field = page.getByLabel("agent key", { exact: true });
	await expect(field).toHaveValue(/^grid_ak_/);
	const key = await field.inputValue();
	await page.getByRole("button", { name: "Done" }).click();
	await expect(page.getByText("Can start threads")).toBeVisible();
	await expect(
		page.getByText("expires in 30 days · $0.00 of $5.00 in 30 days · only its own threads"),
	).toBeVisible();

	const mcp = (body: unknown) =>
		page.request.post("/runner/mcp", {
			headers: { authorization: `Bearer ${key}` },
			data: body,
		});
	const listed = await mcp({ jsonrpc: "2.0", id: 1, method: "tools/list" });
	const tools = ((await listed.json()) as { result: { tools: { name: string }[] } }).result.tools;
	expect(tools.map((tool) => tool.name)).toContain("thread_start");
	const projects = await mcp({
		jsonrpc: "2.0",
		id: 2,
		method: "tools/call",
		params: { name: "list_projects", arguments: {} },
	});
	expect(JSON.stringify(await projects.json())).toContain("demo");

	await page.getByRole("button", { name: "Revoke" }).click();
	await page.getByRole("dialog").getByRole("button", { name: "Revoke" }).click();
	await expect(page.getByText("No keys yet")).toBeVisible();
	expect((await mcp({ jsonrpc: "2.0", id: 3, method: "ping" })).status()).toBe(401);
});

test("runs an automation from a signed webhook, once per delivery", async () => {
	const made = await call("/runner/automations", {
		method: "POST",
		body: {
			name: "Triage alerts",
			prompt: "Triage this alert",
			provider: "claude",
			model: null,
			effort: null,
			mode: null,
			project: "demo",
			workspaceMode: "folder",
			enabled: true,
			triggers: [{ kind: "webhook", filter: { path: "level", equals: "error" }, template: null }],
		},
	});
	expect(made.status).toBe(201);
	const id = (made.body as { data: { id: string } }).data.id;
	await page.goto(`/acme/automations/${id}`);
	await expect(page.getByText("Runs when its webhook is called").first()).toBeVisible();
	const address = await page.getByLabel("webhook address", { exact: true }).inputValue();
	const secret = await page.getByLabel("webhook secret", { exact: true }).inputValue();
	expect(address).toContain(`/runner/hooks/automations/${id}`);

	const deliver = (body: unknown, delivery: string) => {
		const raw = JSON.stringify(body);
		return page.evaluate(
			async ({ address, raw, secret, delivery }) => {
				const key = await crypto.subtle.importKey(
					"raw",
					new TextEncoder().encode(secret),
					{ name: "HMAC", hash: "SHA-256" },
					false,
					["sign"],
				);
				const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
				const hex = [...new Uint8Array(signed)]
					.map((byte) => byte.toString(16).padStart(2, "0"))
					.join("");
				const response = await fetch(address, {
					method: "POST",
					headers: { "x-grid-signature": `sha256=${hex}`, "x-request-id": delivery },
					body: raw,
				});
				return response.status;
			},
			{ address, raw, secret, delivery },
		);
	};
	expect(await deliver({ level: "info" }, "d-1")).toBe(202);
	expect(await deliver({ level: "error", title: "Checkout 500" }, "d-2")).toBe(202);
	expect(await deliver({ level: "error", title: "Checkout 500" }, "d-2")).toBe(200);
	await page.reload();
	await expect(page.getByText(/^ok:/).first()).toBeVisible({ timeout: 20_000 });
	const runs = await call(`/runner/automations/${id}/runs`);
	expect((runs.body as { data: { trigger: string }[] }).data.map((run) => run.trigger)).toEqual([
		"webhook",
	]);
});

test("stops work when a spending limit is used up, and says so", async () => {
	await page.goto("/acme/settings/spending");
	await page.getByRole("button", { name: "New budget" }).click();
	await page.getByRole("button", { name: "Every" }).click();
	await page.getByRole("button", { name: "Day (UTC)", exact: true }).click();
	await page.getByLabel("Limit (USD)").fill("1");
	await page.getByRole("button", { name: "Save budget" }).click();
	await expect(page.getByText("Daily budget for the workspace").first()).toBeVisible();
	await expect(page.getByText("Within it")).toBeVisible();

	await page.goto("/acme/chat/demo");
	await send("COST:2 an expensive job");
	await expect(page.getByText(/ok: COST:2 an expensive job/)).toBeVisible();
	await send("one more thing");
	await expect(page.getByText(/daily budget of \$1\.00 is used up/).first()).toBeVisible();

	await page.goto("/acme/settings/spending");
	await expect(page.getByText("Used up", { exact: true })).toBeVisible();
	await expect(page.getByText("$2.00 of $1.00 this day")).toBeVisible();
	await page.goto("/acme/inbox");
	await expect(page.getByText("The workspace's daily budget is used up").first()).toBeVisible();

	// Removed, work starts again.
	await page.goto("/acme/settings/spending");
	await page.getByRole("button", { name: "Remove" }).click();
	await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
	await expect(page.getByText("No budgets")).toBeVisible();
});

test("lists what keys, guests, webhooks, automations and limits did in the audit log", async () => {
	await page.goto("/acme/settings/audit");
	await expect(page.getByText("Made the agent key").first()).toBeVisible();
	await expect(page.getByText("Revoked the agent key").first()).toBeVisible();
	await expect(page.getByText("Asked in").first()).toBeVisible();
	await expect(page.getByText("Ran").first()).toBeVisible();
	await expect(page.getByText("Used up:").first()).toBeVisible();
	await page.getByRole("button", { name: "Who" }).click();
	await page.getByRole("button", { name: "Guest", exact: true }).click();
	await expect(page.getByText("Made the agent key")).toHaveCount(0);
	await expect(page.getByText("Asked in").first()).toBeVisible();
});
