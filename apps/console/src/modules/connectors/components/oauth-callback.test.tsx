import { render } from "@solidjs/web";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OAuthCallback } from "./oauth-callback";

/** Lets the callback's request and its re-render settle. */
async function settle(): Promise<void> {
	for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

function mount(search: string) {
	window.history.replaceState(null, "", `/oauth/callback${search}`);
	const container = document.createElement("div");
	document.body.append(container);
	const dispose = render(() => <OAuthCallback />, container);
	return {
		container,
		cleanup: () => {
			dispose();
			container.remove();
		},
	};
}

describe("connector sign-in callback", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("finishes the sign-in with the runner itself, with no Grid session and no opener", async () => {
		const fetcher = vi.fn(async () => Response.json({ data: { name: "Linear" } }));
		vi.stubGlobal("fetch", fetcher);
		const { container, cleanup } = mount("?state=state-from-grid-123456&code=abc");
		try {
			await settle();
			expect(fetcher).toHaveBeenCalledTimes(1);
			const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
			expect(url).toBe("/runner/connectors/sign-in/callback");
			expect(new Headers(init.headers).get("authorization")).toBeNull();
			expect(JSON.parse(String(init.body))).toEqual({
				state: "state-from-grid-123456",
				code: "abc",
				error: null,
			});
			expect(container.textContent).toContain("Signed in to Linear");
		} finally {
			cleanup();
		}
	});

	it("shows why it failed", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				Response.json(
					{ message: "That sign-in has expired: start again from Grid" },
					{ status: 410 },
				),
			),
		);
		const { container, cleanup } = mount("?state=old-state-1234567890&code=abc");
		try {
			await settle();
			expect(container.textContent).toContain("Not connected");
			expect(container.textContent).toContain("expired");
		} finally {
			cleanup();
		}
	});

	it("says so when it was not reached from a Grid sign-in", async () => {
		const fetcher = vi.fn();
		vi.stubGlobal("fetch", fetcher);
		const { container, cleanup } = mount("?code=abc");
		try {
			await settle();
			expect(fetcher).not.toHaveBeenCalled();
			expect(container.textContent).toContain("did not come from a Grid sign-in");
		} finally {
			cleanup();
		}
	});
});
