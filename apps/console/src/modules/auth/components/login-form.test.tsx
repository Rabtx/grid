import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@solidjs/web";
import { createRouter, memoryHistory } from "@solidjs/router";
import { AuthProvider, LoginForm } from "@/modules/auth";

/** What `/auth/login` answers with, per test. */
let loginBody: unknown;
let loginStatus = 401;
/** What `/auth/methods/two-factor/verify` answers with, per test. */
let verifyBody: unknown;
let verifyStatus = 200;
let verifyCalls: Array<Record<string, unknown>> = [];
let linkRequests: Array<Record<string, unknown>> = [];

const unauthorized = { success: false, statusCode: 401, message: "Invalid email or password" };

const CHALLENGE = {
	requiresTwoFactor: true,
	challengeToken: "challenge-token-long-enough-to-be-real",
	expiresAt: new Date(Date.now() + 300_000).toISOString(),
	methods: ["totp", "recovery_code"],
};

const SESSION = {
	success: true,
	statusCode: 200,
	data: {
		accessToken: "access-token",
		accessTokenExpiresAt: new Date(Date.now() + 900_000).toISOString(),
		user: { id: "user-1", email: "a@example.com", username: "ada" },
	},
};

const json = (body: unknown, status: number) =>
	new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("LoginForm", () => {
	let container: HTMLElement;
	let dispose: () => void;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);

		loginBody = unauthorized;
		loginStatus = 401;
		verifyBody = SESSION;
		verifyStatus = 200;
		verifyCalls = [];
		linkRequests = [];
		// A browser that can use passkeys (jsdom has none of its own).
		vi.stubGlobal("PublicKeyCredential", class PublicKeyCredential {});

		vi.stubGlobal(
			"fetch",
			vi.fn((url: string | URL | Request, init?: RequestInit) => {
				const urlString = url.toString();
				if (urlString.includes("/auth/refresh")) return Promise.resolve(json(unauthorized, 401));
				if (urlString.includes("/auth/methods/two-factor/verify")) {
					verifyCalls.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
					return Promise.resolve(json(verifyBody, verifyStatus));
				}
				if (urlString.includes("/auth/methods/magic-link/request")) {
					linkRequests.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
					return Promise.resolve(
						json(
							{
								success: true,
								statusCode: 202,
								data: { accepted: true, message: "sent", developmentToken: "dev-token" },
							},
							202,
						),
					);
				}
				if (urlString.includes("/auth/login")) {
					return Promise.resolve(json(loginBody, loginStatus));
				}
				return Promise.resolve(json({}, 404));
			}),
		);

		const Router = createRouter({
			routes: [{ path: "*", component: LoginForm }],
			history: memoryHistory(),
		});

		dispose = render(
			() => (
				<AuthProvider>
					<Router>{(r) => r.children}</Router>
				</AuthProvider>
			),
			container,
		);
	});

	afterEach(() => {
		dispose();
		container.remove();
		vi.unstubAllGlobals();
	});

	/** Set a field the way a person would, then let the handler's signal settle. */
	async function type(input: HTMLInputElement, value: string) {
		input.value = value;
		input.dispatchEvent(new Event("input", { bubbles: true }));
		await new Promise((r) => setTimeout(r, 0));
	}

	const tick = () => new Promise((r) => setTimeout(r, 0));

	/** The email step: type it and Continue. */
	async function submitEmail(email: string) {
		await type(container.querySelector<HTMLInputElement>('input[type="email"]')!, email);
		container.querySelector<HTMLFormElement>("form")!.requestSubmit();
		await tick();
	}

	/** The email step, then the password step, submitted. */
	async function submitPassword(email: string, password: string) {
		await submitEmail(email);
		await type(container.querySelector<HTMLInputElement>('input[type="password"]')!, password);
		container.querySelector<HTMLFormElement>("form")!.requestSubmit();
		await tick();
		await tick();
	}

	/** Type a code into the second step and submit it. */
	async function submitCode(code: string) {
		await type(
			container.querySelector<HTMLInputElement>('input[autocomplete="one-time-code"]')!,
			code,
		);
		container.querySelector<HTMLFormElement>("form")!.requestSubmit();
		await new Promise((r) => setTimeout(r, 0));
		await new Promise((r) => setTimeout(r, 0));
	}

	it("emails a sign-in link instead of asking for the password", async () => {
		await type(container.querySelector<HTMLInputElement>('input[type="email"]')!, "a@example.com");
		[...container.querySelectorAll("button")]
			.find((b) => b.textContent === "Email me a sign-in link")!
			.click();
		await tick();
		await tick();
		expect(linkRequests).toEqual([{ email: "a@example.com" }]);
		expect(container.textContent).toContain("Check your email");
		// A Grid that sends no email (outside production) offers the link here instead.
		expect(container.textContent).toContain("Open the sign-in link here");
	});

	it("asks for the email first, then the password for it", async () => {
		expect(container.querySelector('input[type="email"]')).not.toBeNull();
		expect(container.querySelector('input[type="password"]')).toBeNull();
		expect(container.querySelector('button[type="submit"]')?.textContent).toBe("Continue");
		expect(container.textContent).toContain("No account? Ask a workspace owner for an invite.");

		await submitEmail("a@example.com");
		expect(container.querySelector('input[type="password"]')).not.toBeNull();
		expect(container.querySelector('button[type="submit"]')?.textContent).toBe("Sign in");
		// The account is named, with a way back to change it.
		expect(container.textContent).toContain("a@example.com");
		[...container.querySelectorAll("button")].find((b) => b.textContent === "Change")!.click();
		await tick();
		expect(container.querySelector('input[type="email"]')).not.toBeNull();
	});

	it("shows error on invalid credentials", async () => {
		await submitPassword("test@example.com", "wrongpassword");

		const errorText = container.querySelector('[role="alert"]');
		expect(errorText).not.toBeNull();
		expect(errorText?.textContent).toBe("Invalid email or password");
	});

	it("signs in with a passkey on this device", async () => {
		const calls: string[] = [];
		const credential = Object.assign(Object.create(PublicKeyCredential.prototype), {
			id: "cred",
			rawId: new Uint8Array([1, 2]).buffer,
			type: "public-key",
			authenticatorAttachment: "platform",
			getClientExtensionResults: () => ({}),
			response: {
				clientDataJSON: new Uint8Array([3]).buffer,
				authenticatorData: new Uint8Array([4]).buffer,
				signature: new Uint8Array([5]).buffer,
				userHandle: null,
			},
		});
		vi.stubGlobal("navigator", {
			...navigator,
			credentials: { get: vi.fn(async () => credential) },
		});
		const base = globalThis.fetch;
		vi.stubGlobal(
			"fetch",
			vi.fn((url: string | URL | Request, init?: RequestInit) => {
				const path = url.toString();
				if (path.includes("/passkeys/options")) {
					calls.push(`options ${String(init?.body)}`);
					return Promise.resolve(
						json(
							{
								success: true,
								statusCode: 201,
								data: { challengeId: "c1", options: { challenge: "AQID" } },
							},
							201,
						),
					);
				}
				if (path.includes("/passkeys/verify")) {
					calls.push(`verify ${String(init?.body)}`);
					return Promise.resolve(json(SESSION, 200));
				}
				return base(url, init);
			}),
		);
		[...container.querySelectorAll("button")]
			.find((b) => b.textContent === "Sign in with a passkey")!
			.click();
		await tick();
		await tick();
		await tick();

		expect(container.querySelector('[role="alert"]')?.textContent ?? "").toBe("");
		expect(calls[0]).toBe("options {}");
		expect(calls[1]).toContain('"challengeId":"c1"');
		expect(calls[1]).toContain('"rawId":"AQI"');
		expect(container.querySelector('[role="alert"]')).toBeNull();
	});

	it("explains a cancelled passkey prompt and keeps the email step", async () => {
		vi.stubGlobal("navigator", {
			credentials: {
				get: vi.fn(async () => {
					throw new DOMException("cancelled", "NotAllowedError");
				}),
			},
		});
		const base = globalThis.fetch;
		vi.stubGlobal(
			"fetch",
			vi.fn((url: string | URL | Request, init?: RequestInit) =>
				url.toString().includes("/passkeys/options")
					? Promise.resolve(
							json(
								{
									success: true,
									statusCode: 201,
									data: { challengeId: "c1", options: { challenge: "AQID" } },
								},
								201,
							),
						)
					: base(url, init),
			),
		);
		[...container.querySelectorAll("button")]
			.find((b) => b.textContent === "Sign in with a passkey")!
			.click();
		await tick();
		await tick();
		expect(container.querySelector('[role="alert"]')?.textContent).toBe(
			"No passkey was used. Try again, or continue with your email.",
		);
		expect(container.querySelector('input[type="email"]')).not.toBeNull();
	});

	describe("with a second factor", () => {
		beforeEach(() => {
			loginBody = CHALLENGE;
			loginStatus = 200;
		});

		it("asks for a code instead of signing in, naming the account", async () => {
			await submitPassword("a@example.com", "correct-password");

			expect(container.querySelector('input[type="email"]')).toBeNull();
			const code = container.querySelector<HTMLInputElement>('input[autocomplete="one-time-code"]');
			expect(code).not.toBeNull();
			expect(container.textContent).toContain("Two-factor code");
			expect(container.textContent).toContain("a@example.com");
			// Still on the code step, not signed in.
			expect(container.querySelector('[role="alert"]')).toBeNull();
		});

		it("sends the challenge token and the trimmed code", async () => {
			await submitPassword("a@example.com", "correct-password");
			await submitCode(" 123456 ");

			// The code is trimmed before it goes out, and the challenge travels with it.
			expect(verifyCalls).toEqual([{ challengeToken: CHALLENGE.challengeToken, code: "123456" }]);
			expect(container.querySelector('[role="alert"]')).toBeNull();
		});

		it("keeps the step open and explains a refused code", async () => {
			verifyBody = { success: false, statusCode: 401, message: "That code is not valid" };
			verifyStatus = 401;

			await submitPassword("a@example.com", "correct-password");
			await submitCode("000000");

			expect(container.querySelector('[role="alert"]')?.textContent).toBe("That code is not valid");
			// Still on the code step, so another code can be typed straight away.
			expect(container.querySelector('input[autocomplete="one-time-code"]')).not.toBeNull();
		});

		it("goes back to the password step for a different account", async () => {
			await submitPassword("a@example.com", "correct-password");

			const back = [...container.querySelectorAll("button")].find(
				(button) => button.textContent === "Use a different account",
			);
			back!.click();
			await new Promise((r) => setTimeout(r, 0));

			expect(container.querySelector('input[type="email"]')).not.toBeNull();
			expect(verifyCalls).toEqual([]);
		});
	});
});
