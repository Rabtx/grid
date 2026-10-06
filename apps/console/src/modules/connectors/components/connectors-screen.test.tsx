import { createRouter, memoryHistory } from "@solidjs/router";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ShellProvider } from "@/modules/shell";

import { connectorsService } from "../services/connectors.service";
import type { CatalogService, ConnectorsView } from "../types/connector.types";
import { ConnectorsScreen } from "./connectors-screen";

vi.mock("@/modules/auth", () => ({ useAuth: () => ({ token: () => "token" }) }));
vi.mock("@/modules/workspaces", () => ({
	useWorkspaces: () => ({
		current: () => ({ slug: "rabtx", name: "RabtX", role: "owner", settings: {} }),
	}),
}));
vi.mock("../services/connectors.service", () => ({
	connectorsService: { view: vi.fn(), update: vi.fn(async () => ({})), signInOutcome: vi.fn() },
}));

const service = (id: string, name: string): CatalogService => ({
	id,
	name,
	kind: "Plan",
	category: "dev",
	blurb: `${name} blurb`,
	powers: [],
	signIn: ["oauth", "key"],
	capabilities: [{ id: "read", label: "Read", hint: null, short: null, initial: "allow" }],
});

const VIEW: ConnectorsView = {
	catalog: ["github", "linear", "vercel", "sentry", "stripe", "posthog", "slack"].map((id) =>
		service(id, id.charAt(0).toUpperCase() + id.slice(1)),
	),
	connections: [
		{
			id: "c1",
			kind: "github",
			name: "GitHub",
			transport: "http",
			url: null,
			command: null,
			env: {},
			auth: "gh",
			powers: [],
			enabled: true,
			rules: { read: "allow" },
			capabilities: [{ id: "read", label: "Read", hint: null, short: null, initial: "allow" }],
			agents: {},
			hiddenRepositories: [],
			tools: ["get_me"],
			status: "healthy",
			statusDetail: null,
			checkedAt: null,
			expiresAt: null,
		},
		{
			id: "c2",
			kind: "custom",
			name: "Postgres",
			transport: "stdio",
			url: null,
			command: "npx server-postgres",
			env: {},
			auth: "none",
			powers: [],
			enabled: true,
			rules: { read: "allow", write: "never" },
			capabilities: [
				{ id: "read", label: "Read", hint: null, short: null, initial: "allow" },
				{ id: "write", label: "Change things", hint: null, short: "changes", initial: "ask" },
			],
			agents: {},
			hiddenRepositories: [],
			tools: ["query", "list_tables"],
			status: "healthy",
			statusDetail: null,
			checkedAt: null,
			expiresAt: null,
		},
	],
	suggested: ["linear", "vercel", "sentry", "stripe", "posthog", "slack"],
	secrets: [],
	agentsWithoutConnectors: [],
};

async function settle() {
	for (let index = 0; index < 8; index++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		flush();
	}
}

describe("ConnectorsScreen", () => {
	let container: HTMLElement;
	let dispose: () => void;
	beforeEach(() => {
		vi.mocked(connectorsService.view).mockResolvedValue(VIEW);
		container = document.createElement("div");
		document.body.append(container);
		const Router = createRouter({
			routes: [{ path: "/settings/connectors", component: ConnectorsScreen }],
			history: memoryHistory("/settings/connectors"),
		});
		dispose = render(
			() => <Router>{(route) => <ShellProvider>{route.children}</ShellProvider>}</Router>,
			container,
		);
	});
	afterEach(() => {
		dispose();
		container.remove();
		vi.clearAllMocks();
	});

	it("shows what is connected, five suggestions with the rest a click away, and own servers", async () => {
		await settle();
		const text = container.textContent ?? "";
		expect(text).toContain("GitHub");
		expect(text).toContain("Healthy");
		expect(text).toContain("Agents: Read only");
		expect(text).toContain("Suggested for RabtX");
		expect(text).toContain("Posthog");
		expect(text).not.toContain("Slack");
		expect(text).toContain("Show all 6");
		expect(text).toContain("Postgres");
		expect(text).toContain("Read only · on this machine · 2 tools");
		[...container.querySelectorAll("button")]
			.find((button) => button.textContent?.trim() === "Show all 6")
			?.click();
		await settle();
		expect(container.textContent).toContain("Slack");
	});

	it("turns one of the workspace's own servers off", async () => {
		await settle();
		container.querySelector<HTMLElement>('[aria-label="Postgres on"]')?.click();
		await settle();
		expect(connectorsService.update).toHaveBeenCalledWith("token", "c2", { enabled: false });
	});
});

describe("ConnectorsScreen picking up a sign-in", () => {
	it("reopens the service's dialog at its tools when a sign-in came back to continue", async () => {
		vi.mocked(connectorsService.view).mockResolvedValue(VIEW);
		vi.mocked(connectorsService.signInOutcome).mockResolvedValue({
			status: "done",
			grant: "g1",
			tools: [{ name: "list_issues", description: "" }],
			ms: 5,
		} as never);
		// The sign-in window's "Continue in Grid" lands here with the sign-in to resume.
		window.history.replaceState(null, "", "/settings/connectors?resume=state-1&service=linear");
		const container = document.createElement("div");
		document.body.append(container);
		const Router = createRouter({
			routes: [{ path: "/settings/connectors", component: ConnectorsScreen }],
			history: memoryHistory("/settings/connectors"),
		});
		const dispose = render(
			() => <Router>{(route) => <ShellProvider>{route.children}</ShellProvider>}</Router>,
			container,
		);
		try {
			await settle();
			await settle();
			expect(connectorsService.signInOutcome).toHaveBeenCalledWith("token", "state-1");
			const dialog = document.querySelector("dialog[open]")?.textContent ?? "";
			expect(dialog).toContain("Connect Linear");
			expect(dialog).toContain("1 tools");
		} finally {
			dispose();
			container.remove();
			window.history.replaceState(null, "", "/");
			vi.clearAllMocks();
		}
	});
});
