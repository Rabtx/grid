import { createRouter, memoryHistory, useLocation } from "@solidjs/router";
import { render } from "@solidjs/web";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/modules/auth";
import { WorkspaceProvider } from "@/modules/projects";

import { ProjectSwitcher } from "./project-switcher";

const project = (slug: string, name: string) => ({
	slug,
	name,
	summary: null,
	repoUrl: null,
	status: "active",
	createdAt: "2026-09-23T00:00:00.000Z",
	updatedAt: "2026-09-23T00:00:00.000Z",
});
const json = (data: unknown): Response =>
	new Response(JSON.stringify({ success: true, statusCode: 200, data }), {
		headers: { "Content-Type": "application/json" },
	});
async function settle(): Promise<void> {
	for (let i = 0; i < 15; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("ProjectSwitcher", () => {
	let dispose = () => {};
	afterEach(() => {
		dispose();
		document.body.innerHTML = "";
		vi.unstubAllGlobals();
	});

	it("titles the page with its project and opens another project's same page", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: string | URL | Request) => {
				const url = input.toString();
				if (url.endsWith("/auth/refresh"))
					return json({
						accessToken: "token",
						accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
						user: { id: "u1", email: "person@example.com", username: "person" },
					});
				if (url.endsWith("/projects"))
					return json([project("alpha", "Alpha"), project("beta", "Beta")]);
				return json({});
			}),
		);
		let path = "";
		function Page() {
			const location = useLocation();
			return (
				<>
					<span data-path>{(path = location.pathname)}</span>
					<ProjectSwitcher />
				</>
			);
		}
		const Router = createRouter({
			routes: [{ path: "/files/:slug", component: Page }],
			history: memoryHistory("/files/alpha"),
		});
		const container = document.createElement("div");
		document.body.append(container);
		dispose = render(
			() => (
				<AuthProvider>
					<Router>{(route) => <WorkspaceProvider>{route.children}</WorkspaceProvider>}</Router>
				</AuthProvider>
			),
			container,
		);
		await settle();
		const trigger = container.querySelector<HTMLButtonElement>(
			'button[aria-label="Show another project"]',
		);
		expect(trigger?.textContent).toContain("Alpha");
		trigger?.click();
		await settle();
		const beta = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Beta",
		);
		beta?.click();
		await settle();
		expect(path).toBe("/files/beta");
	});
});
