import { createRouter, memoryHistory } from "@solidjs/router";
import { render } from "@solidjs/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider, SetupForm } from "@/modules/auth";

import { usernameFrom } from "./setup-form";

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("usernameFrom", () => {
	it("takes an email's local part in the characters a username allows", () => {
		expect(usernameFrom("Shabir.Khan+grid@rabtx.dev")).toBe("shabir.khan-grid");
		expect(usernameFrom("al@x.io")).toBe("al-owner");
		expect(usernameFrom("...@x.io")).toBe("owner");
	});
});

describe("SetupForm", () => {
	let container: HTMLElement;
	let dispose: () => void;
	let setupBody: Record<string, unknown> | null;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.append(container);
		setupBody = null;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
				const url = input.toString();
				if (url.includes("/auth/refresh")) {
					return json({ success: false, statusCode: 401, message: "No session" }, 401);
				}
				if (url.includes("/instance/setup")) {
					setupBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
					return json({ success: false, statusCode: 409, message: "Already set up" }, 409);
				}
				return json({ success: true, statusCode: 200, data: null });
			}),
		);
	});

	afterEach(() => {
		dispose();
		container.remove();
		vi.unstubAllGlobals();
	});

	function mount(path: string): void {
		const Router = createRouter({
			routes: [{ path: "/setup", component: SetupForm }],
			history: memoryHistory(path),
		});
		dispose = render(
			() => (
				<AuthProvider>
					<Router>{(route) => route.children}</Router>
				</AuthProvider>
			),
			container,
		);
	}

	async function type(selector: string, value: string): Promise<void> {
		const input = container.querySelector<HTMLInputElement>(selector)!;
		input.value = value;
		input.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
	}

	it("asks for the setup link without its code", async () => {
		mount("/setup");
		await tick();
		expect(container.querySelector("h1")?.textContent).toBe("Set up Grid");
		expect(container.textContent).toContain("setup-link.txt");
		expect(container.querySelector("form")).toBeNull();
	});

	it("takes the owner account, then the workspace, and sends both together", async () => {
		mount("/setup?code=one-time");
		await tick();
		expect(container.textContent).toContain("Create the owner account");
		await type('input[autocomplete="name"]', "Shabir Khan");
		await type('input[type="email"]', "shabir@rabtx.dev");
		await type('input[autocomplete="new-password"]', "a long passphrase here");
		container.querySelector("form")!.requestSubmit();
		await tick();

		expect(container.querySelector("h1")?.textContent).toBe("Name your workspace");
		await type('input[placeholder="Acme"]', "RabtX Labs");
		// The address follows the name.
		const address = [...container.querySelectorAll<HTMLInputElement>("input")].at(-1)!;
		expect(address.value).toBe("rabtx-labs");
		container.querySelector("form")!.requestSubmit();
		await tick();
		await tick();

		expect(setupBody).toEqual({
			code: "one-time",
			email: "shabir@rabtx.dev",
			username: "shabir",
			password: "a long passphrase here",
			displayName: "Shabir Khan",
			workspace: { name: "RabtX Labs", slug: "rabtx-labs" },
		});
		// The API's refusal shows, and the step stays for another go.
		expect(container.querySelector('[role="alert"]')?.textContent).toBe("Already set up");
		expect(container.querySelector("h1")?.textContent).toBe("Name your workspace");
	});
});
