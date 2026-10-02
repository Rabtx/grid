import { createRouter, memoryHistory, useLocation } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/modules/auth";
import { WorkspaceProvider } from "@/modules/projects";
import { ShellProvider } from "@/modules/shell";

import { HomeScreen } from "./home-screen";

const NOW = new Date().toISOString();

const projects = ["alpha", "beta"].map((slug) => ({
	slug,
	name: slug === "alpha" ? "Alpha" : "Beta",
	summary: null,
	repoUrl: null,
	status: "active",
	createdAt: NOW,
	updatedAt: NOW,
}));

const task = (
	number: number,
	status: string,
	owner: { kind: string; name: string | null } | null,
) => ({
	key: `T-${number}`,
	number,
	title: `Task ${number}`,
	description: null,
	status,
	owner,
	branch: null,
	position: number,
	createdAt: NOW,
	updatedAt: NOW,
});

type Answers = {
	inbox?: unknown[] | "fail";
	/** Never answer the boards, to see what shows while they load. */
	hold?: boolean;
	alpha?: unknown[] | "fail";
	beta?: unknown[] | "fail";
	automations?: unknown[] | "fail";
};

function json(data: unknown, status = 200): Response {
	return Response.json({ success: status < 400, statusCode: status, data }, { status });
}

/**
 * Answers the API and the runner the way they would for one test. The answers object is read on
 * every call, so a test can change it to see a retry pick up the new state.
 */
function serve(answers: Answers): void {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: string | URL | Request) => {
			const url = input.toString();
			if (url.includes("/auth/refresh")) {
				return json({
					accessToken: "token",
					accessTokenExpiresAt: new Date(Date.now() + 900_000).toISOString(),
					user: { id: "u1", email: "sam@example.com", username: "sam" },
				});
			}
			if (url.includes("/inbox/unread")) return Response.json({ data: { unread: 0 } });
			if (url.includes("/inbox/read")) return Response.json({ data: { changed: 1, unread: 0 } });
			if (url.includes("/inbox")) {
				if (answers.inbox === "fail") {
					return Response.json({ message: "The runner is not running." }, { status: 503 });
				}
				const items = answers.inbox ?? [];
				return Response.json({
					data: {
						items,
						unread: (items as { readAt: string | null }[]).filter((item) => !item.readAt).length,
						github: true,
					},
				});
			}
			if (url.includes("/automations")) {
				if (answers.automations === "fail") {
					return Response.json({ message: "offline" }, { status: 503 });
				}
				return Response.json({ data: answers.automations ?? [] });
			}
			for (const slug of ["alpha", "beta"] as const) {
				if (url.includes(`/projects/${slug}/tasks`)) {
					if (answers.hold) return new Promise<Response>(() => {});
					const held = answers[slug];
					return held === "fail" ? json(null, 500) : json(held ?? []);
				}
			}
			if (url.endsWith("/projects")) return json(projects);
			return json(null, 404);
		}),
	);
}

function Where(): JSX.Element {
	return <p data-testid="where">{useLocation().pathname}</p>;
}

async function settle(): Promise<void> {
	for (let i = 0; i < 20; i++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		flush();
	}
}

describe("HomeScreen", () => {
	let container: HTMLElement;
	let dispose: () => void;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.append(container);
	});

	afterEach(() => {
		dispose();
		container.remove();
		vi.unstubAllGlobals();
	});

	function mount(): void {
		const Router = createRouter({
			routes: [
				{ path: "/home", component: HomeScreen },
				{ path: "/board/:slug/tasks/:number", component: Where },
				{ path: "/chat/:project/:id", component: Where },
			],
			history: memoryHistory("/home"),
		});
		dispose = render(
			() => (
				<AuthProvider>
					<Router>
						{(route) => (
							<WorkspaceProvider>
								<ShellProvider>{route.children}</ShellProvider>
							</WorkspaceProvider>
						)}
					</Router>
				</AuthProvider>
			),
			container,
		);
	}

	const section = (title: string) =>
		[...container.querySelectorAll("section")].find(
			(element) => element.querySelector("h2")?.textContent === title,
		);
	const rowTitles = (title: string) =>
		[...(section(title)?.querySelectorAll("button .truncate") ?? [])]
			.map((element) => element.textContent ?? "")
			.filter((text) => text.length > 0 && !text.includes(" · "));

	it("greets the person and gathers what needs them, the work in flight and what runs next", async () => {
		serve({
			inbox: [
				{
					id: "approval:s1",
					kind: "approval",
					project: "alpha",
					title: "Debounce typing",
					body: "Wants to run bun add",
					url: "/chat/alpha/s1",
					createdAt: NOW,
					readAt: null,
				},
				{
					id: "turn_done:s2",
					kind: "turn_done",
					project: "alpha",
					title: "Shipped the fix",
					body: "Done",
					url: "/chat/alpha/s2",
					createdAt: NOW,
					readAt: NOW,
				},
			],
			alpha: [
				task(1, "in_progress", { kind: "agent", name: "Claude Code" }),
				task(2, "backlog", null),
			],
			beta: [task(7, "blocked", { kind: "human", name: "Ayesha" })],
			automations: [
				{
					id: "j1",
					name: "Weekly digest",
					project: "alpha",
					enabled: true,
					nextRunAt: new Date(Date.now() + 3 * 3_600_000).toISOString(),
					triggers: [],
				},
			],
		});
		mount();
		await settle();

		expect(container.querySelector("h1")?.textContent).toMatch(
			/^Good (morning|afternoon|evening), sam$/,
		);
		expect(container.textContent).toContain("1 thing needs you · 2 tasks moving");
		expect(rowTitles("Needs you")).toEqual(["Debounce typing"]);
		// Blocked work comes first, and each row says whose it is.
		expect(rowTitles("Agents' plan for today")).toEqual(["Task 7", "Task 1"]);
		expect(section("Agents' plan for today")?.textContent).toContain("Beta · Ayesha · Blocked");
		expect(section("Agents' plan for today")?.textContent).toContain(
			"Alpha · Claude Code · In progress",
		);
		expect(rowTitles("Scheduled")).toEqual(["Weekly digest"]);
		// What was dealt with is news in the aside, and only there.
		expect(section("While you were away")?.textContent).toContain("Shipped the fix");
		expect(section("Needs you")?.textContent).not.toContain("Shipped the fix");
		expect(section("While you were away")?.textContent).not.toContain("Debounce typing");
		// Each waiting item says what to do with it.
		expect(
			section("Needs you")?.querySelector('button[aria-label="Answer: Debounce typing"]'),
		).not.toBeNull();
		// The run's time (or "Tmrw" just before midnight) leads the row.
		expect(section("Scheduled")?.textContent).toMatch(
			/^Scheduled.*(\d{2}:\d{2}|Tmrw)Weekly digest/,
		);
	});

	it("opens a task where it lives when its row is tapped", async () => {
		serve({ alpha: [task(1, "review", null)] });
		mount();
		await settle();

		const row =
			section("Agents' plan for today")?.querySelector<HTMLButtonElement>("button:has(.truncate)");
		row?.click();
		await settle();
		expect(container.querySelector('[data-testid="where"]')?.textContent).toBe(
			"/board/alpha/tasks/1",
		);
	});

	it("says so plainly when there is nothing, rather than showing empty cards", async () => {
		serve({});
		mount();
		await settle();

		expect(container.textContent).toContain("Nothing needs you");
		expect(container.textContent).toContain("Nothing is waiting on you.");
		expect(container.textContent).toContain("No work in flight.");
		expect(container.textContent).toContain("Nothing scheduled.");
	});

	it("keeps the rest of the page when one board or the runner does not answer", async () => {
		serve({ alpha: [task(3, "in_progress", null)], beta: "fail", automations: "fail" });
		mount();
		await settle();

		expect(rowTitles("Agents' plan for today")).toEqual(["Task 3"]);
		// The note names the project and why, and the runner's own sentence says what is wrong.
		expect(container.textContent).toContain("Beta's board did not answer");
		expect(container.textContent).toContain("Automations did not answer: offline");
	});

	it("shows an error when no board answers, and Try again reads them again", async () => {
		const answers: Answers = { alpha: "fail", beta: "fail" };
		serve(answers);
		mount();
		await settle();

		expect(section("Agents' plan for today")?.textContent).toContain("The boards did not answer");
		answers.alpha = [task(4, "review", null)];
		answers.beta = [];
		[...(section("Agents' plan for today")?.querySelectorAll("button") ?? [])]
			.find((button) => button.textContent === "Try again")
			?.click();
		await settle();

		expect(rowTitles("Agents' plan for today")).toEqual(["Task 4"]);
	});

	it("shows placeholders while the boards load, and says nothing about them yet", async () => {
		serve({ hold: true });
		mount();
		await settle();

		expect(section("Agents' plan for today")?.querySelectorAll(".kit-shimmer").length).toBe(3);
		expect(rowTitles("Agents' plan for today")).toEqual([]);
		expect(container.textContent).not.toContain("No work in flight.");
		expect(container.textContent).not.toContain("tasks moving");
	});

	it("does not claim nothing needs you when the inbox fails, and retries it", async () => {
		const answers: Answers = { inbox: "fail" };
		serve(answers);
		mount();
		await settle();

		expect(container.textContent).not.toContain("Nothing needs you");
		expect(section("Needs you")?.textContent).toContain("The runner is not running.");
		answers.inbox = [];
		[...(section("Needs you")?.querySelectorAll("button") ?? [])]
			.find((button) => button.textContent === "Try again")
			?.click();
		await settle();
		expect(container.textContent).toContain("Nothing needs you");
	});

	it("follows an inbox item to its thread when its row is tapped", async () => {
		serve({
			inbox: [
				{
					id: "turn_done:s9",
					kind: "turn_done",
					project: "alpha",
					title: "Fix the login",
					body: "Finished",
					url: "/chat/alpha/s9",
					createdAt: NOW,
					readAt: null,
				},
			],
		});
		mount();
		await settle();

		[...(section("Needs you")?.querySelectorAll("button") ?? [])]
			.find((button) => button.textContent?.startsWith("Fix the login"))
			?.click();
		await settle();
		expect(container.querySelector('[data-testid="where"]')?.textContent).toBe("/chat/alpha/s9");
	});
});
