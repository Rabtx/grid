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
	it("renders user message right-aligned with rounded bubble and a copy action", async () => {
		const blocks: Block[] = [{ kind: "user", key: "b0", text: "Hello world" }];
		const root = mount(() => (
			<>
				<TranscriptView blocks={blocks} running={false} onApprove={() => {}} />
			</>
		));
		flush();

		const userWrapper = root.querySelector(".group\\/message");
		expect(userWrapper).not.toBeNull();
		expect(userWrapper?.className).toContain("items-end");

		const bubble = userWrapper?.querySelector(".bg-fill-strong");
		expect(bubble).not.toBeNull();
		expect(bubble?.textContent).toContain("Hello world");

		// Action buttons
		const copyBtn = userWrapper?.querySelector<HTMLButtonElement>(
			'button[aria-label="Copy message"]',
		);
		expect(copyBtn).not.toBeNull();
		expect(copyBtn?.getAttribute("title")).toBe("Copy");

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
		expect(copyBtn?.getAttribute("title")).toBe("Copy");
		copyBtn?.click();
		expect(navigator.clipboard.writeText).toHaveBeenCalledWith("Here is your code");

		// Regenerate button
		const regenerateBtn = assistantWrapper?.querySelector<HTMLButtonElement>(
			'button[aria-label="Regenerate response"]',
		);
		expect(regenerateBtn).not.toBeNull();
		expect(regenerateBtn?.disabled).toBe(false);
		regenerateBtn?.click();
		expect(onRegenerate).toHaveBeenCalledWith("Write some code");
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
		expect(regenerateBtn?.getAttribute("title")).toBe("Cannot regenerate while running");
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
	it("hides the hover action bars on touch screens", () => {
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
		for (const bar of bars) expect(bar).toContain("pointer-coarse:hidden");
	});
});
