// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@solidjs/web";
import { createRouter, memoryHistory } from "@solidjs/router";
import { AuthProvider, LoginForm } from "@/modules/auth";

describe("LoginForm", () => {
	let container: HTMLElement;
	let dispose: () => void;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);

		vi.stubGlobal(
			"fetch",
			vi.fn((url: string | URL | Request) => {
				const urlString = url.toString();
				if (urlString.includes("/auth/refresh")) {
					return Promise.resolve(
						new Response(
							JSON.stringify({ success: false, statusCode: 401, message: "Unauthorized" }),
							{
								status: 401,
								headers: { "Content-Type": "application/json" },
							},
						),
					);
				}
				if (urlString.includes("/auth/login")) {
					return Promise.resolve(
						new Response(
							JSON.stringify({
								success: false,
								statusCode: 401,
								message: "Invalid email or password",
							}),
							{
								status: 401,
								headers: { "Content-Type": "application/json" },
							},
						),
					);
				}
				return Promise.resolve(new Response(JSON.stringify({}), { status: 404 }));
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

	it("renders email, password inputs and submit button", () => {
		const emailInput = container.querySelector<HTMLInputElement>('input[type="email"]');
		const passwordInput = container.querySelector<HTMLInputElement>('input[type="password"]');
		const submitButton = container.querySelector<HTMLButtonElement>('button[type="submit"]');

		expect(emailInput).not.toBeNull();
		expect(passwordInput).not.toBeNull();
		expect(submitButton).not.toBeNull();
		expect(submitButton?.textContent).toBe("Sign in");
	});

	it("shows error on invalid credentials", async () => {
		const emailInput = container.querySelector<HTMLInputElement>('input[type="email"]');
		const passwordInput = container.querySelector<HTMLInputElement>('input[type="password"]');
		const form = container.querySelector<HTMLFormElement>("form");

		expect(emailInput).not.toBeNull();
		expect(passwordInput).not.toBeNull();
		expect(form).not.toBeNull();

		emailInput!.value = "test@example.com";
		emailInput!.dispatchEvent(new Event("input", { bubbles: true }));

		passwordInput!.value = "wrongpassword";
		passwordInput!.dispatchEvent(new Event("input", { bubbles: true }));

		form!.requestSubmit();

		await new Promise((r) => setTimeout(r, 0));
		await new Promise((r) => setTimeout(r, 0));

		const errorText = container.querySelector("p.text-destructive");
		expect(errorText).not.toBeNull();
		expect(errorText?.textContent).toBe("Invalid email or password");
	});
});
