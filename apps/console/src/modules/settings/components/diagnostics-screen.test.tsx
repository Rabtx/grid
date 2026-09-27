import { createRouter, memoryHistory } from "@solidjs/router";
import { render } from "@solidjs/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/modules/auth";
import { WorkspaceProvider } from "@/modules/projects";

import { DiagnosticsScreen } from "./diagnostics-screen";

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify({ success: status < 400, statusCode: status, data }), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

async function settle(): Promise<void> {
	for (let i = 0; i < 8; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("DiagnosticsScreen", () => {
	let container: HTMLElement;
	let dispose: () => void;
	let fetcher: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		localStorage.clear();
		fetcher = vi.fn(async (input: string | URL | Request) => {
			const url = input.toString();
			if (url.endsWith("/auth/refresh")) {
				return json({
					accessToken: "token",
					accessTokenExpiresAt: "2026-09-23T01:00:00.000Z",
					user: { id: "u1", email: "person@example.com", username: "person" },
				});
			}
			if (url.includes("/runner/diagnostics")) {
				return json({
					events: [
						{
							id: 1,
							at: Date.now(),
							workspace: "ws-1",
							kind: "connection",
							source: "chat",
							message: "chat socket closed",
							details: { code: 1006, reason: "The connection dropped", sessionId: "session-1" },
						},
					],
					reconnects24h: 2,
				});
			}
			if (url.endsWith("/projects")) return json([]);
			return json(null, 404);
		});
		vi.stubGlobal("fetch", fetcher);
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: { writeText: vi.fn(async () => {}) },
		});

		const Router = createRouter({
			routes: [{ path: "/settings/diagnostics", component: DiagnosticsScreen }],
			history: memoryHistory("/settings/diagnostics"),
		});
		container = document.createElement("div");
		document.body.append(container);
		dispose = render(
			() => (
				<AuthProvider>
					<Router>{(route) => <WorkspaceProvider>{route.children}</WorkspaceProvider>}</Router>
				</AuthProvider>
			),
			container,
		);
	});

	afterEach(() => {
		dispose();
		container.remove();
		vi.unstubAllGlobals();
		localStorage.clear();
	});

	it("shows reconnect count and safe socket details, filters and copies visible events", async () => {
		await settle();
		const text = container.textContent ?? "";
		expect(text).toContain("Diagnostics");
		expect(text).toContain("Reconnects in the last 24 hours");
		expect(text).toContain("2");
		expect(text).toContain("1006");
		expect(text).toContain("session-1");

		const errors = [...container.querySelectorAll("button")].find(
			(button) => button.textContent === "Errors",
		);
		errors?.click();
		await settle();
		expect(fetcher.mock.calls.some(([input]) => input.toString().includes("kind=error"))).toBe(
			true,
		);

		const copy = [...container.querySelectorAll("button")].find(
			(button) => button.textContent === "Copy as text",
		);
		copy?.click();
		await settle();
		expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
			expect.stringContaining("session-1"),
		);
	});
});
