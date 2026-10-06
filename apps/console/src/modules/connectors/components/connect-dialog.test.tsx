import { render } from "@solidjs/web";
import { afterEach, describe, expect, it, vi } from "vitest";

import { connectorsService } from "../services/connectors.service";
import type { CatalogService } from "../types/connector.types";
import { ConnectDialog } from "./connect-dialog";

vi.mock("@/modules/auth", () => ({ useAuth: () => ({ token: () => "token" }) }));
vi.mock("../services/connectors.service", () => ({
	connectorsService: {
		startSignIn: vi.fn(async () => ({
			url: "https://mcp.neon.tech/api/authorize?state=s1",
			state: "s1",
		})),
		signInOutcome: vi.fn(async () => ({ status: "waiting" })),
	},
}));

const NEON: CatalogService = {
	id: "neon",
	name: "Neon",
	kind: "Database",
	category: "dev",
	blurb: "",
	powers: [],
	signIn: ["oauth", "key"],
	capabilities: [{ id: "read", label: "Read", hint: null, short: null, initial: "allow" }],
} as unknown as CatalogService;

async function settle(): Promise<void> {
	for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

/** A screen of one kind: a phone's touch screen, or a desktop's mouse. */
function screen(touch: boolean): void {
	vi.stubGlobal(
		"matchMedia",
		(query: string) =>
			({
				matches: query.includes("coarse") ? touch : false,
				addEventListener: () => {},
				removeEventListener: () => {},
			}) as unknown as MediaQueryList,
	);
}

function mount() {
	const container = document.createElement("div");
	document.body.append(container);
	const dispose = render(
		() => <ConnectDialog service={NEON} onClose={() => {}} onConnected={() => {}} />,
		container,
	);
	return () => {
		dispose();
		container.remove();
	};
}

const signInButton = () =>
	[...document.querySelectorAll("dialog[open] button")].find(
		(item) => item.textContent === "Sign in to Neon",
	) as HTMLButtonElement | undefined;

describe("ConnectDialog opening a sign-in", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it("on a phone, opens the service from a link the person taps, never a blank popup", async () => {
		screen(true);
		const open = vi.fn();
		vi.stubGlobal("open", open);
		const cleanup = mount();
		try {
			await settle();
			signInButton()?.click();
			await settle();
			expect(connectorsService.startSignIn).toHaveBeenCalled();
			expect(open).not.toHaveBeenCalled();
			const link = document.querySelector<HTMLAnchorElement>("dialog[open] a[target=_blank]");
			expect(link?.textContent).toContain("Continue to Neon");
			expect(link?.getAttribute("href")).toBe("https://mcp.neon.tech/api/authorize?state=s1");
			// Waiting for it from the moment it is ready, wherever the sign-in comes back.
			expect(connectorsService.signInOutcome).toHaveBeenCalledWith("token", "s1");
		} finally {
			cleanup();
		}
	});

	it("on a desktop, opens a fresh popup each time, never a named window from an earlier try", async () => {
		screen(false);
		const popup = { location: { href: "" }, close: vi.fn() };
		const open = vi.fn(() => popup);
		vi.stubGlobal("open", open);
		const cleanup = mount();
		try {
			await settle();
			signInButton()?.click();
			await settle();
			expect(open).toHaveBeenCalledWith("about:blank", "_blank", "popup,width=520,height=720");
			expect(popup.location.href).toBe("https://mcp.neon.tech/api/authorize?state=s1");
		} finally {
			cleanup();
		}
	});
});
