import { createRouter, memoryHistory } from "@solidjs/router";
import { render } from "@solidjs/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../context/auth-context";
import { MagicLink } from "./magic-link";

const json = (body: unknown, status: number) =>
	new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const SESSION = {
	success: true,
	statusCode: 200,
	data: {
		accessToken: "access-token",
		accessTokenExpiresAt: new Date(Date.now() + 900_000).toISOString(),
		user: { id: "user-1", email: "a@example.com", username: "ada" },
	},
};
const CHALLENGE = {
	success: true,
	statusCode: 200,
	data: {
		requiresTwoFactor: true,
		challengeToken: "challenge-token-long-enough-to-be-real",
		expiresAt: new Date(Date.now() + 300_000).toISOString(),
		methods: ["totp", "recovery_code"],
	},
};

let consumeAnswer: Response;
let consumed: Array<Record<string, unknown>> = [];
const settle = async () => {
	for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
};

describe("MagicLink", () => {
	let container: HTMLElement;
	let dispose: () => void;
	let history: ReturnType<typeof memoryHistory>;

	beforeEach(() => {
		consumed = [];
		vi.stubGlobal(
			"fetch",
			vi.fn((url: string | URL | Request, init?: RequestInit) => {
				const path = url.toString();
				if (path.includes("/auth/refresh"))
					return Promise.resolve(json({ success: false, statusCode: 401 }, 401));
				if (path.includes("/auth/methods/magic-link/consume")) {
					consumed.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
					return Promise.resolve(consumeAnswer);
				}
				return Promise.resolve(json({}, 404));
			}),
		);
	});
	afterEach(() => {
		dispose();
		container.remove();
		vi.unstubAllGlobals();
	});

	async function open(search: string) {
		window.history.replaceState(null, "", `/magic-link${search}`);
		container = document.createElement("div");
		document.body.append(container);
		history = memoryHistory();
		history.set({ value: "/magic-link" });
		const Router = createRouter({ routes: [{ path: "*", component: MagicLink }], history });
		dispose = render(
			() => (
				<AuthProvider>
					<Router>{(r) => r.children}</Router>
				</AuthProvider>
			),
			container,
		);
		await settle();
	}

	it("signs in with the link once and opens Grid, taking the token out of the address", async () => {
		consumeAnswer = json(SESSION, 200);
		await open("?token=link-token");
		expect(consumed).toEqual([{ token: "link-token" }]);
		expect(window.location.search).toBe("");
		expect(history.get()).toBe("/");
	});

	it("asks for the two-factor code when the account has one", async () => {
		consumeAnswer = json(CHALLENGE, 200);
		await open("?token=link-token");
		expect(container.textContent).toContain("Two-factor code");
		expect(container.querySelector('input[autocomplete="one-time-code"]')).not.toBeNull();
	});

	it("says so when the link is spent or expired", async () => {
		consumeAnswer = json(
			{
				success: false,
				statusCode: 401,
				code: "MAGIC_LINK_INVALID",
				message: "The sign-in link is invalid or expired",
			},
			401,
		);
		await open("?token=old-token");
		expect(container.textContent).toContain("That link didn't work");
		expect(container.textContent).toContain("invalid or expired");
	});
});
