import { render } from "@solidjs/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SourceStatus } from "../services/files.service";

const service = vi.hoisted(() => ({
	status: vi.fn(),
	diff: vi.fn(),
	init: vi.fn(),
	commit: vi.fn(),
	message: vi.fn(),
	push: vi.fn(),
}));
vi.mock("../services/files.service", () => ({ sourceService: service }));
vi.mock("@/modules/auth", () => ({
	useAuth: () => ({
		token: () => "token",
		user: () => ({ id: "u", username: "sam", email: "sam@example.com" }),
	}),
}));

import { remoteLabel, SourceControl } from "./source-control";

const base: SourceStatus = {
	repo: true,
	top: true,
	branch: "main",
	remote: { name: "origin", url: "git@github.com:acme/web.git" },
	upstream: "origin/main",
	ahead: 0,
	behind: 0,
	commits: true,
	identity: { name: "Sam", email: "sam@example.com" },
	recent: [{ sha: "abc1234", subject: "feat: start", author: "Sam", at: "2026-11-01T00:00:00Z" }],
	changes: [
		{ path: "src/a.ts", status: "modified", added: 2, removed: 1 },
		{ path: "b.md", status: "added", added: 4, removed: 0 },
	],
};

async function settle(): Promise<void> {
	for (let i = 0; i < 15; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}
function button(host: HTMLElement, text: RegExp): HTMLButtonElement | undefined {
	return [...host.querySelectorAll<HTMLButtonElement>("button")].find((item) =>
		text.test(item.textContent ?? item.getAttribute("aria-label") ?? ""),
	);
}

describe("SourceControl", () => {
	let dispose = () => {};
	beforeEach(() => {
		for (const fn of Object.values(service)) fn.mockReset();
	});
	afterEach(() => {
		dispose();
		document.body.replaceChildren();
	});

	async function mount(status: SourceStatus): Promise<HTMLElement> {
		service.status.mockResolvedValue(status);
		const host = document.createElement("div");
		document.body.append(host);
		dispose = render(
			() => (
				<SourceControl
					slug="alpha"
					name="Alpha"
					fileHref={(path) => `/f/${path}`}
					onChanged={() => {}}
				/>
			),
			host,
		);
		await settle();
		return host;
	}

	it("offers to start git in a project that is not in it", async () => {
		const host = await mount({ ...base, repo: false, changes: [], recent: [] });
		expect(host.textContent).toContain("Not in git yet");
		service.init.mockResolvedValue({ ...base, changes: [], recent: [] });
		button(host, /Start git here/)?.click();
		await settle();
		expect(service.init).toHaveBeenCalledWith("token", "alpha");
		expect(host.textContent).toContain("Nothing to commit");
	});

	it("writes a message with an agent and commits the files chosen", async () => {
		const host = await mount(base);
		expect(host.textContent).toContain("github.com/acme/web");
		expect(button(host, /Commit 2 files/)?.disabled).toBe(true);
		// Leave b.md out.
		host.querySelector<HTMLInputElement>('input[aria-label="Commit b.md"]')?.click();
		await settle();
		service.message.mockResolvedValue({ message: "fix: tidy a", agent: "claude" });
		button(host, /Write message/)?.click();
		await settle();
		expect(service.message).toHaveBeenCalledWith("token", "alpha", ["src/a.ts"]);
		expect(host.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("fix: tidy a");
		service.commit.mockResolvedValue({
			commit: { sha: "def5678", subject: "fix: tidy a" },
			status: { ...base, ahead: 1, changes: [base.changes[1]] },
		});
		button(host, /Commit 1 file/)?.click();
		await settle();
		expect(service.commit).toHaveBeenCalledWith("token", "alpha", {
			paths: ["src/a.ts"],
			message: "fix: tidy a",
			author: { name: "sam", email: "sam@example.com" },
		});
		expect(host.textContent).toContain("1 commit not pushed yet");
	});

	it("shows a file's diff when it is opened", async () => {
		const host = await mount(base);
		service.diff.mockResolvedValue({
			path: "src/a.ts",
			diff: "diff --git a/src/a.ts b/src/a.ts\n@@ -1,1 +1,1 @@\n-old\n+fresh\n",
			tooLarge: false,
			binary: false,
		});
		button(host, /src\/a\.ts/)?.click();
		await settle();
		expect(service.diff).toHaveBeenCalledWith("token", "alpha", "src/a.ts");
		expect(host.textContent).toContain("fresh");
	});
});

describe("remoteLabel", () => {
	it("reads ssh and https remotes alike", () => {
		expect(remoteLabel("git@github.com:acme/web.git")).toBe("github.com/acme/web");
		expect(remoteLabel("https://github.com/acme/web.git")).toBe("github.com/acme/web");
		expect(remoteLabel("https://x:tok@github.com/acme/web")).toBe("github.com/acme/web");
	});
});
