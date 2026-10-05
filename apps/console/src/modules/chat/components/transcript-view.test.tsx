// @vitest-environment happy-dom

import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { Block } from "../lib/transcript";
import { TranscriptView } from "./transcript-view";

let dispose: (() => void) | undefined;
let container: HTMLElement;

function mount(view: () => ReturnType<typeof TranscriptView>): HTMLElement {
	container = document.createElement("div");
	document.body.append(container);
	dispose = render(view, container);
	return container;
}

beforeAll(() => {
	if (!HTMLElement.prototype.showPopover) {
		HTMLElement.prototype.showPopover = vi.fn();
	}
	if (!HTMLElement.prototype.hidePopover) {
		HTMLElement.prototype.hidePopover = vi.fn();
	}
	Object.defineProperty(navigator, "clipboard", {
		value: {
			writeText: vi.fn().mockResolvedValue(undefined),
		},
		writable: true,
		configurable: true,
	});
});

afterEach(() => {
	dispose?.();
	container?.remove();
	vi.clearAllMocks();
});

describe("TranscriptView - edit diffs", () => {
	it("shows an edit's changed lines in colour with its counts", () => {
		const blocks: Block[] = [
			{
				kind: "tool",
				key: "t0",
				id: "e1",
				title: "Edit src/app.ts",
				tool: "edit",
				status: "completed",
				input: "src/app.ts",
				diffs: [
					{
						path: "src/app.ts",
						patch: "@@ -1,2 +1,2 @@\n const a = 1;\n-const b = 2;\n+const b = 3;",
						added: 1,
						removed: 1,
					},
				],
			},
		];
		const root = mount(() => (
			<TranscriptView blocks={blocks} running={false} onApprove={() => {}} />
		));
		flush();
		expect(root.querySelector('tr[data-kind="add"]')?.textContent).toContain("const b = 3;");
		expect(root.querySelector('tr[data-kind="del"]')?.textContent).toContain("const b = 2;");
		expect(root.querySelector("figcaption")?.textContent).toContain("src/app.ts");
		// The raw path input gives way to the diff.
		expect(root.querySelector("pre")).toBeNull();
	});
});

describe("TranscriptView - Add as note", () => {
	it("saves a sent message or an agent answer through onNote", () => {
		const onNote = vi.fn();
		const blocks: Block[] = [
			{ kind: "user", key: "b0", text: "Plan the API" },
			{ kind: "assistant", key: "b1", text: "Use **Hono**" },
		];
		const root = mount(() => (
			<TranscriptView blocks={blocks} running={false} onApprove={() => {}} onNote={onNote} />
		));
		flush();

		const buttons = root.querySelectorAll<HTMLButtonElement>('button[aria-label="Add as note"]');
		expect(buttons).toHaveLength(2);
		buttons[0]?.click();
		buttons[1]?.click();
		expect(onNote).toHaveBeenNthCalledWith(1, "Plan the API");
		expect(onNote).toHaveBeenNthCalledWith(2, "Use **Hono**");
	});

	it("shows no note action without onNote", () => {
		const blocks: Block[] = [{ kind: "assistant", key: "b1", text: "Hi" }];
		const root = mount(() => (
			<TranscriptView blocks={blocks} running={false} onApprove={() => {}} />
		));
		flush();
		expect(root.querySelector('button[aria-label="Add as note"]')).toBeNull();
	});
});

describe("TranscriptView - User Message", () => {
	it("opens the turn with what you asked in a soft card, with a copy action", async () => {
		const blocks: Block[] = [{ kind: "user", key: "b0", text: "Hello world" }];
		const root = mount(() => (
			<>
				<TranscriptView blocks={blocks} running={false} onApprove={() => {}} />
			</>
		));
		flush();

		const userWrapper = root.querySelector(".group\\/message");
		expect(userWrapper).not.toBeNull();
		const bubble = userWrapper?.querySelector(".bg-selection");
		expect(bubble).not.toBeNull();
		expect(bubble?.textContent).toContain("Hello world");

		// Action buttons
		const copyBtn = userWrapper?.querySelector<HTMLButtonElement>(
			'button[aria-label="Copy message"]',
		);
		expect(copyBtn).not.toBeNull();
		expect(copyBtn?.getAttribute("data-tooltip")).toBe("Copy");

		copyBtn?.click();
		expect(navigator.clipboard.writeText).toHaveBeenCalledWith("Hello world");
	});

	it("shows more / show less for long user messages", () => {
		const longText = "line1\nline2\nline3\nline4\nline5\nline6";
		const blocks: Block[] = [{ kind: "user", key: "b0", text: longText }];
		const root = mount(() => (
			<TranscriptView blocks={blocks} running={false} onApprove={() => {}} />
		));
		flush();

		const toggleBtn = [...root.querySelectorAll("button")].find(
			(btn) => btn.textContent?.trim() === "Show more",
		);
		expect(toggleBtn).toBeDefined();

		toggleBtn?.click();
		flush();
		expect(toggleBtn?.textContent?.trim()).toBe("Show less");
	});
});

describe("TranscriptView - Assistant Message", () => {
	it("renders response with copy and regenerate actions", () => {
		const onRegenerate = vi.fn();

		const blocks: Block[] = [
			{ kind: "user", key: "b0", text: "Write some code" },
			{ kind: "assistant", key: "b1", text: "Here is your code" },
		];

		const root = mount(() => (
			<>
				<TranscriptView
					blocks={blocks}
					running={false}
					onApprove={() => {}}
					onRegenerate={onRegenerate}
				/>
			</>
		));
		flush();

		const assistantWrapper = [...root.querySelectorAll(".group\\/message")].at(-1);
		expect(assistantWrapper).not.toBeNull();

		// Copy response
		const copyBtn = assistantWrapper?.querySelector<HTMLButtonElement>(
			'button[aria-label="Copy response"]',
		);
		expect(copyBtn).not.toBeNull();
		expect(copyBtn?.getAttribute("data-tooltip")).toBe("Copy");
		copyBtn?.click();
		expect(navigator.clipboard.writeText).toHaveBeenCalledWith("Here is your code");

		// Regenerate button
		const regenerateBtn = assistantWrapper?.querySelector<HTMLButtonElement>(
			'button[aria-label="Regenerate response"]',
		);
		expect(regenerateBtn).not.toBeNull();
		expect(regenerateBtn?.disabled).toBe(false);
		regenerateBtn?.click();
		expect(onRegenerate).toHaveBeenCalledWith({ text: "Write some code", attachments: [] });
	});

	it("regenerates a message sent with only files, sending the files again", () => {
		const onRegenerate = vi.fn();
		const file = { id: "a1", name: "shot.png", size: 3, mimeType: "image/png" };
		const blocks: Block[] = [
			{ kind: "user", key: "b0", text: "", attachments: [file] },
			{ kind: "assistant", key: "b1", text: "A login form" },
		];
		const root = mount(() => (
			<TranscriptView
				blocks={blocks}
				running={false}
				onApprove={() => {}}
				onRegenerate={onRegenerate}
			/>
		));
		flush();
		root.querySelector<HTMLButtonElement>('button[aria-label="Regenerate response"]')?.click();
		expect(onRegenerate).toHaveBeenCalledWith({ text: "", attachments: ["a1"] });
	});

	it("disables regenerate button while running", () => {
		const blocks: Block[] = [
			{ kind: "user", key: "b0", text: "Query" },
			{ kind: "assistant", key: "b1", text: "Answer" },
		];

		const root = mount(() => (
			<TranscriptView blocks={blocks} running={true} onApprove={() => {}} />
		));
		flush();

		const regenerateBtn = root.querySelector<HTMLButtonElement>(
			'button[aria-label="Regenerate response"]',
		);
		expect(regenerateBtn).not.toBeNull();
		expect(regenerateBtn?.disabled).toBe(true);
		expect(regenerateBtn?.getAttribute("data-tooltip")).toBe("Cannot regenerate while running");
	});

	it("omits regenerate button when no preceding user prompt exists", () => {
		const blocks: Block[] = [{ kind: "assistant", key: "b0", text: "Initial greeting" }];

		const root = mount(() => (
			<TranscriptView blocks={blocks} running={false} onApprove={() => {}} />
		));
		flush();

		const regenerateBtn = root.querySelector<HTMLButtonElement>(
			'button[aria-label="Regenerate response"]',
		);
		expect(regenerateBtn).toBeNull();
	});
});

describe("TranscriptView - touch", () => {
	it("keeps the hover action bars out of reach on touch screens, but mounted for the long press", () => {
		const blocks: Block[] = [
			{ kind: "user", key: "b0", text: "Write some code" },
			{ kind: "assistant", key: "b1", text: "Here is your code" },
		];
		const root = mount(() => (
			<TranscriptView blocks={blocks} running={false} onApprove={() => {}} />
		));
		flush();
		const bars = [...root.querySelectorAll("button[aria-label^='Copy']")].map(
			(button) => button.parentElement?.className ?? "",
		);
		expect(bars.length).toBe(2);
		// Not display:none: the message's menu lives in the bar, and a long press must be able to
		// open it. The bar takes no room and cannot be tapped instead.
		for (const bar of bars) {
			expect(bar).not.toContain("pointer-coarse:hidden");
			expect(bar).toContain("pointer-coarse:pointer-events-none");
			expect(bar).toContain("pointer-coarse:size-0");
		}
	});
});

describe("TranscriptView - Turns", () => {
	const tool = (n: number, kind: "read" | "edit" | "execute" = "read"): Block => ({
		kind: "tool",
		key: `t${n}`,
		id: `t${n}`,
		title: kind === "execute" ? "bun test" : `src/file-${n}.ts`,
		tool: kind,
		status: "completed",
		input: kind === "execute" ? undefined : JSON.stringify({ path: `src/file-${n}.ts` }),
	});

	it("says how long a finished turn worked, with no Done line", () => {
		const blocks: Block[] = [
			{
				kind: "user",
				key: "b0",
				text: "Fix the build",
				startedAt: "2026-09-27T10:00:00.000Z",
				endedAt: "2026-09-27T10:01:28.000Z",
				outcome: "done",
			},
			{ kind: "assistant", key: "b1", text: "Fixed." },
		];
		const root = mount(() => (
			<TranscriptView blocks={blocks} running={false} onApprove={() => {}} />
		));
		flush();
		expect(root.textContent).toContain("Worked for 1m 28s");
		expect(root.textContent).not.toContain("Done");
	});

	it("shows the agent working, and no Done, while the turn runs", () => {
		const blocks: Block[] = [{ kind: "user", key: "b0", text: "Fix the build" }];
		const root = mount(() => (
			<TranscriptView blocks={blocks} running={true} onApprove={() => {}} />
		));
		flush();
		expect(root.textContent).toContain("Working…");
		expect(root.textContent).not.toContain("Done");
	});

	it("lists a few steps in an open card, one row each with what it touched", () => {
		const blocks: Block[] = [
			{ kind: "user", key: "b0", text: "Look around" },
			tool(1),
			tool(2, "execute"),
		];
		const root = mount(() => (
			<TranscriptView blocks={blocks} running={false} onApprove={() => {}} />
		));
		flush();
		// The card's own line, then one per step.
		const card = root.querySelector("details");
		expect(card?.open).toBe(true);
		const lines = [...root.querySelectorAll("details details summary")].map(
			(line) => line.textContent ?? "",
		);
		expect(lines).toHaveLength(2);
		expect(lines[0]).toContain("file-1.ts");
		expect(lines[1]).toContain("Ran");
	});

	it("folds a long run into one counted line", () => {
		const blocks: Block[] = [
			{ kind: "user", key: "b0", text: "Refactor" },
			...[1, 2, 3, 4, 5].map((n) => tool(n, "edit")),
			tool(6, "execute"),
			tool(7, "execute"),
		];
		const root = mount(() => (
			<TranscriptView blocks={blocks} running={false} onApprove={() => {}} />
		));
		flush();
		const first = root.querySelector("summary")?.textContent ?? "";
		expect(first).toContain("7 steps, edited 5 files, ran 2 commands");
	});

	it("names a failure as the agent stopping, in a card", () => {
		const blocks: Block[] = [
			{ kind: "user", key: "b0", text: "Deploy", outcome: "error" },
			{ kind: "notice", key: "b1", tone: "error", text: "Access expired mid-read." },
		];
		const root = mount(() => (
			<TranscriptView blocks={blocks} running={false} onApprove={() => {}} />
		));
		flush();
		expect(root.textContent).toContain("The agent stopped");
		expect(root.textContent).toContain("Open terminal");
		expect(root.querySelector(".bg-selection")?.textContent ?? "").toContain("Deploy");
		expect(root.textContent).toContain("Access expired mid-read.");
		expect(root.textContent).not.toContain("Done");
	});
});

describe("TranscriptView - Try again", () => {
	const failed: Block[] = [
		{ kind: "user", key: "b0", text: "Ship the build" },
		{
			kind: "notice",
			key: "b1",
			tone: "error",
			text: "Codex is busy: this is on the provider's side, not yours.",
			retry: true,
		},
	];

	function retryButton(root: HTMLElement): HTMLButtonElement | undefined {
		return [...root.querySelectorAll("button")].find(
			(button) => button.textContent?.trim() === "Try again",
		);
	}

	it("offers to send the message again, and sends the same one", () => {
		const onRegenerate = vi.fn();
		const root = mount(() => (
			<TranscriptView
				blocks={failed}
				running={false}
				onApprove={() => {}}
				onRegenerate={onRegenerate}
			/>
		));
		flush();
		const button = retryButton(root);
		expect(button).toBeDefined();
		expect(button?.disabled).toBe(false);
		button?.click();
		expect(onRegenerate).toHaveBeenCalledWith({ text: "Ship the build", attachments: [] });
	});

	it("waits while the agent is working", () => {
		const onRegenerate = vi.fn();
		const root = mount(() => (
			<TranscriptView blocks={failed} running onApprove={() => {}} onRegenerate={onRegenerate} />
		));
		flush();
		expect(retryButton(root)?.disabled).toBe(true);
	});

	it("offers nothing to resend when the turn did not fail on its own", () => {
		const onRegenerate = vi.fn();
		const blocks: Block[] = [
			{ kind: "user", key: "b0", text: "Ship the build" },
			{ kind: "notice", key: "b1", tone: "error", text: "Not allowed to run rm." },
		];
		const root = mount(() => (
			<TranscriptView
				blocks={blocks}
				running={false}
				onApprove={() => {}}
				onRegenerate={onRegenerate}
			/>
		));
		flush();
		expect(retryButton(root)).toBeUndefined();
		expect(onRegenerate).not.toHaveBeenCalled();
	});

	it("offers it only on the last failed turn, not on older ones", () => {
		const blocks: Block[] = [
			...failed,
			{ kind: "user", key: "b2", text: "Ship it again" },
			{
				kind: "notice",
				key: "b3",
				tone: "error",
				text: "Codex is busy: this is on the provider's side, not yours.",
				retry: true,
			},
		];
		const onRegenerate = vi.fn();
		const root = mount(() => (
			<TranscriptView
				blocks={blocks}
				running={false}
				onApprove={() => {}}
				onRegenerate={onRegenerate}
			/>
		));
		flush();
		const buttons = [...root.querySelectorAll("button")].filter(
			(button) => button.textContent?.trim() === "Try again",
		);
		expect(buttons).toHaveLength(1);
		buttons[0]?.click();
		expect(onRegenerate).toHaveBeenCalledWith({ text: "Ship it again", attachments: [] });
	});

	it("offers nothing without onRegenerate", () => {
		const root = mount(() => (
			<TranscriptView blocks={failed} running={false} onApprove={() => {}} />
		));
		flush();
		expect(retryButton(root)).toBeUndefined();
	});
});

it("renders replayed attachments, loads images and offers a retry on failure", async () => {
	const load = vi
		.fn()
		.mockRejectedValueOnce(new Error("offline"))
		.mockResolvedValue(new Blob(["image"], { type: "image/png" }));
	const blocks: Block[] = [
		{
			kind: "user",
			key: "b0",
			text: "Look",
			attachments: [
				{ id: "image", name: "screen.png", size: 100, mimeType: "image/png" },
				{ id: "text", name: "readme.txt", size: 5, mimeType: "application/octet-stream" },
			],
		},
	];
	const root = mount(() => (
		<TranscriptView blocks={blocks} running={false} onApprove={() => {}} loadAttachment={load} />
	));
	await vi.waitFor(() => expect(root.textContent).toContain("Attachment unavailable"));
	expect(root.textContent).toContain("readme.txt");
	const retry = Array.from(root.querySelectorAll("button")).find(
		(button) => button.textContent === "Retry",
	)!;
	retry.click();
	await vi.waitFor(() =>
		expect(root.querySelector('a[target="_blank"] img[alt="screen.png"]')).not.toBeNull(),
	);
	expect(load).toHaveBeenCalledTimes(2);
	expect(load.mock.calls.every((call) => call[0] === "image")).toBe(true);
});

describe("TranscriptView - approvals and stopped turns", () => {
	it("keeps a waiting approval out of the record, and shows an answered one there", () => {
		const approval = (resolved?: string | null): Block => ({
			kind: "approval",
			key: `a-${String(resolved)}`,
			id: `a-${String(resolved)}`,
			title: "Wants to push a branch",
			detail: "git push",
			options: [{ id: "allow", label: "Approve", kind: "allow" }],
			resolved,
		});
		const waiting = mount(() => (
			<TranscriptView
				blocks={[{ kind: "user", key: "u", text: "Push" }, approval()]}
				running={true}
				onApprove={() => {}}
			/>
		));
		flush();
		// Docked over the composer instead (Conversation), so not drawn twice.
		expect(waiting.textContent).not.toContain("Wants to push a branch");

		const answered = mount(() => (
			<TranscriptView
				blocks={[{ kind: "user", key: "u", text: "Push" }, approval("allow")]}
				running={false}
				onApprove={() => {}}
			/>
		));
		flush();
		expect(answered.textContent).toContain("Wants to push a branch");
		expect(answered.textContent).toContain("Approve");
	});

	it("does not spin a stopped turn's unfinished step", () => {
		const blocks: Block[] = [
			{ kind: "user", key: "u", text: "Build", outcome: "cancelled" },
			{
				kind: "tool",
				key: "t",
				id: "t",
				title: "bun run build",
				tool: "execute",
				status: "running",
			},
		];
		const root = mount(() => (
			<TranscriptView blocks={blocks} running={false} onApprove={() => {}} />
		));
		flush();
		expect(root.querySelector(".animate-spin")).toBeNull();
	});
});
