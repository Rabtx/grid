import { createRouter, memoryHistory } from "@solidjs/router";
import { render } from "@solidjs/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/modules/auth";
import { WorkspaceProvider } from "@/modules/projects";

import { Composer } from "./composer";

const projects = [{ slug: "alpha", name: "Alpha" }].map((project) => ({
	...project,
	summary: null,
	repoUrl: null,
	status: "active",
	createdAt: "2026-09-23T00:00:00.000Z",
	updatedAt: "2026-09-23T00:00:00.000Z",
}));

const mockFiles = ["src/app.ts", "src/components/composer.tsx", "src/index.ts", "README.md"];

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify({ success: status < 400, statusCode: status, data }), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

async function settle(): Promise<void> {
	for (let i = 0; i < 25; i++) await new Promise((resolve) => setTimeout(resolve, 10));
}

function typeInto(textarea: HTMLTextAreaElement, value: string, cursorPosition?: number): void {
	textarea.value = value;
	const pos = cursorPosition ?? value.length;
	textarea.setSelectionRange(pos, pos);
	textarea.dispatchEvent(new Event("input", { bubbles: true }));
	textarea.dispatchEvent(new Event("keyup", { bubbles: true }));
}

function pressKey(element: HTMLElement, key: string, extra: KeyboardEventInit = {}): void {
	element.dispatchEvent(
		new KeyboardEvent("keydown", {
			key,
			bubbles: true,
			cancelable: true,
			...extra,
		}),
	);
}

describe("Composer with file mentions", () => {
	let container: HTMLElement;
	let dispose: () => void;
	let sentText: string | null;

	beforeEach(() => {
		sentText = null;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: string | URL | Request) => {
				const url = input.toString();
				if (url.endsWith("/auth/refresh")) {
					return json({
						accessToken: "test-token",
						accessTokenExpiresAt: "2026-09-23T01:00:00.000Z",
						user: { id: "u1", email: "person@example.com", username: "person" },
					});
				}
				if (url.endsWith("/projects")) return json(projects);
				if (url.includes("/environments/placements")) return json({});
				if (url.includes("/projects/files/alpha/search")) {
					const parsed = new URL(url, "http://localhost");
					const q = (parsed.searchParams.get("q") ?? "").toLowerCase();
					const filtered = q ? mockFiles.filter((f) => f.toLowerCase().includes(q)) : mockFiles;
					return json(filtered);
				}
				return json(null, 404);
			}),
		);
	});

	afterEach(() => {
		dispose?.();
		container?.remove();
		vi.unstubAllGlobals();
	});

	function mount(
		onSend = vi.fn().mockImplementation((text: string) => {
			sentText = text;
			return true;
		}),
	): void {
		const Router = createRouter({
			routes: [
				{
					path: "/chat/:project",
					component: () => <Composer project="alpha" running={false} onSend={onSend} />,
				},
			],
			history: memoryHistory("/chat/alpha"),
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
	}

	it("opens the file mention popup when typing @", async () => {
		mount();
		await settle();

		const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
		expect(textarea).not.toBeNull();
		if (!textarea) return;

		typeInto(textarea, "@");
		await settle();

		const popup = container.querySelector('[aria-label="File mentions"]');
		expect(popup).not.toBeNull();
		expect(container.textContent).toContain("app.ts");
		expect(container.textContent).toContain("composer.tsx");
	});

	it("filters the file list as user types query after @", async () => {
		mount();
		await settle();

		const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
		if (!textarea) return;

		typeInto(textarea, "@comp");
		await settle();

		expect(container.textContent).toContain("composer.tsx");
		expect(container.textContent).not.toContain("README.md");
	});

	it("navigates options with ArrowDown / ArrowUp and selects with Enter", async () => {
		mount();
		await settle();

		const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
		if (!textarea) return;

		typeInto(textarea, "@");
		await settle();

		const options = container.querySelectorAll("button[data-selected]");
		expect(options.length).toBeGreaterThan(1);
		expect(options[0].getAttribute("data-selected")).toBe("true");

		// Press ArrowDown
		pressKey(textarea, "ArrowDown");
		await settle();

		const afterDown = container.querySelectorAll("button[data-selected]");
		expect(afterDown[1].getAttribute("data-selected")).toBe("true");

		// Press Enter to select second option: src/components/composer.tsx
		pressKey(textarea, "Enter");
		await settle();

		// Popup closes
		expect(container.querySelector('[aria-label="File mentions"]')).toBeNull();
		// Selected mention token is inserted
		expect(textarea.value).toBe("@src/components/composer.tsx ");
	});

	it("selects with Tab key", async () => {
		mount();
		await settle();

		const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
		if (!textarea) return;

		typeInto(textarea, "Please review @app");
		await settle();

		pressKey(textarea, "Tab");
		await settle();

		expect(container.querySelector('[aria-label="File mentions"]')).toBeNull();
		expect(textarea.value).toBe("Please review @src/app.ts ");
	});

	it("closes the popup when pressing Escape", async () => {
		mount();
		await settle();

		const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
		if (!textarea) return;

		typeInto(textarea, "@");
		await settle();

		expect(container.querySelector('[aria-label="File mentions"]')).not.toBeNull();

		pressKey(textarea, "Escape");
		await settle();

		expect(container.querySelector('[aria-label="File mentions"]')).toBeNull();
		expect(textarea.value).toBe("@");
	});

	it("allows mouse/touch selection of an item from the popup", async () => {
		mount();
		await settle();

		const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
		if (!textarea) return;

		typeInto(textarea, "Check @");
		await settle();

		const itemButton = [
			...container.querySelectorAll<HTMLButtonElement>("button[data-selected]"),
		].find((b) => b.textContent?.includes("README.md"));
		expect(itemButton).toBeDefined();

		itemButton?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
		await settle();

		expect(container.querySelector('[aria-label="File mentions"]')).toBeNull();
		expect(textarea.value).toBe("Check @README.md ");
	});

	it("sends plain text containing the mention tokens to the agent", async () => {
		const onSend = vi.fn().mockImplementation((text: string) => {
			sentText = text;
			return true;
		});
		mount(onSend);
		await settle();

		const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
		if (!textarea) return;

		typeInto(textarea, "@app");
		await settle();

		pressKey(textarea, "Enter");
		await settle();

		expect(textarea.value).toBe("@src/app.ts ");

		// Submit the form
		const form = container.querySelector("form");
		form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		await settle();

		expect(onSend).toHaveBeenCalledWith("@src/app.ts");
		expect(sentText).toBe("@src/app.ts");
	});
});
