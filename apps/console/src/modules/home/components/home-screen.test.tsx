import { createRouter, memoryHistory, useLocation } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/modules/auth";
import { WorkspaceProvider } from "@/modules/projects";

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
	inbox?: unknown[];
	alpha?: unknown[] | "fail";
	beta?: unknown[] | "fail";
	automations?: unknown[] | "fail";
};

function json(data: unknown, status = 200): Response {
	return Response.json({ success: status < 400, statusCode: status, data }, { status });
}

/** Answers the API and the runner the way they would for one test. */
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
			if (url.includes("/inbox")) {
				const items = answers.inbox ?? [];
				return Response.json({ data: { items, unread: items.length, github: true } });
			}
			if (url.includes("/automations")) {
				if (answers.automations === "fail") {
					return Response.json({ message: "offline" }, { status: 503 });
				}
				return Response.json({ data: answers.automations ?? [] });
			}
			for (const slug of ["alpha", "beta"] as const) {
				if (url.includes(`/projects/${slug}/tasks`)) {
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
					<Router>{(route) => <WorkspaceProvider>{route.children}</WorkspaceProvider>}</Router>
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
		expect(rowTitles("Moving now")).toEqual(["#7 Task 7", "#1 Task 1"]);
		expect(section("Moving now")?.textContent).toContain("Beta · Ayesha · Blocked");
		expect(section("Moving now")?.textContent).toContain("Alpha · Claude Code · In progress");
		expect(rowTitles("Up next")).toEqual(["Weekly digest"]);
		expect(section("Up next")?.textContent).toContain("in 3 h");
	});

	it("opens a task where it lives when its row is tapped", async () => {
		serve({ alpha: [task(1, "review", null)] });
		mount();
		await settle();

		const row = [...(section("Moving now")?.querySelectorAll("button") ?? [])][0];
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

		expect(rowTitles("Moving now")).toEqual(["#3 Task 3"]);
		expect(container.textContent).toContain("One project's board did not answer.");
		expect(container.textContent).toContain("Automations did not answer");
	});

	it("shows an error with a retry when no board answers at all", async () => {
		serve({ alpha: "fail", beta: "fail" });
		mount();
		await settle();

		expect(section("Moving now")?.textContent).toContain("The boards did not answer");
		expect(
			[...(section("Moving now")?.querySelectorAll("button") ?? [])].some(
				(button) => button.textContent === "Try again",
			),
		).toBe(true);
	});
});
