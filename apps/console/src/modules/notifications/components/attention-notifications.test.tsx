import { createRouter, memoryHistory } from "@solidjs/router";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ShellProvider } from "@/modules/shell";

import { approvalLine } from "../lib/words";
import { attentionService } from "../services/attention.service";
import { AttentionNotifications } from "./attention-notifications";

const permissions = vi.hoisted(() => ({ role: "owner" }));
vi.mock("@/modules/workspaces", () => ({
	useWorkspaces: () => ({ current: () => ({ role: permissions.role }) }),
}));

vi.mock("@/modules/auth", () => ({ useAuth: () => ({ token: () => "token" }) }));
vi.mock("@/modules/environments", () => ({ placementsStore: { scopes: () => [""] } }));
vi.mock("@/modules/inbox", () => ({
	INBOX_KINDS: {},
	inboxStore: {
		unread: () => 0,
		items: () => [],
		loaded: () => false,
		error: () => null,
		count: vi.fn(async () => {}),
		load: vi.fn(async () => {}),
	},
}));
vi.mock("../services/attention.service", () => ({
	attentionService: {
		waiting: vi.fn(),
		approve: vi.fn(async () => {}),
	},
}));

async function settle() {
	for (let index = 0; index < 8; index++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		flush();
	}
}

const asking = (sessionId: string) => ({
	sessionId,
	project: "grid",
	thread: "chat-typing",
	provider: "claude",
	approval: {
		id: "a1",
		title: "bun add lodash.debounce",
		detail: null,
		options: [
			{ id: "yes", label: "Allow", kind: "allow" as const },
			{ id: "no", label: "Deny", kind: "deny" as const },
		],
	},
});

function mount(path: string) {
	const container = document.createElement("div");
	document.body.append(container);
	const Router = createRouter({
		routes: [{ path: "*", component: () => <AttentionNotifications /> }],
		history: memoryHistory(path),
	});
	const dispose = render(
		() => <Router>{(route) => <ShellProvider>{route.children}</ShellProvider>}</Router>,
		container,
	);
	return { container, dispose };
}

describe("AttentionNotifications", () => {
	let view: ReturnType<typeof mount>;
	beforeEach(() => {
		permissions.role = "owner";
		vi.mocked(attentionService.waiting).mockResolvedValue([asking("s1")]);
	});
	afterEach(() => {
		view.dispose();
		view.container.remove();
		vi.clearAllMocks();
	});

	it("asks for an approval from anywhere, and answers it there", async () => {
		view = mount("/board/grid");
		await settle();
		const text = view.container.textContent ?? "";
		expect(text).toContain("Claude Code needs you");
		expect(text).toContain("Wants to run bun add lodash.debounce in grid · chat-typing");
		const allow = [...view.container.querySelectorAll("button")].find(
			(button) => button.textContent === "Allow",
		);
		allow?.click();
		await settle();
		expect(attentionService.approve).toHaveBeenCalledWith("token", "", "s1", "a1", "yes");
		expect(view.container.textContent ?? "").not.toContain("needs you");
	});

	it("keeps opening available to viewers without offering approval actions", async () => {
		permissions.role = "viewer";
		view = mount("/board/grid");
		await settle();
		const actions = [...view.container.querySelectorAll("button")].map(
			(button) => button.textContent,
		);
		expect(actions).toContain("Open");
		expect(actions).not.toContain("Allow");
		expect(actions).not.toContain("Deny");
	});

	it("leaves the thread you are reading to its own composer", async () => {
		view = mount("/chat/grid/s1");
		await settle();
		expect(view.container.textContent ?? "").not.toContain("needs you");
	});
});

describe("approvalLine", () => {
	it("says what the agent wants as a person would", () => {
		expect(approvalLine("bun add zod")).toBe("Wants to run bun add zod");
		expect(approvalLine("Edit src/eta.ts")).toBe("Wants to edit src/eta.ts");
	});
});
