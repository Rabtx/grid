// @vitest-environment happy-dom

import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { Toaster } from "@/ui";

import type { Block } from "../lib/transcript";
import type { Choice } from "../types/chat.types";
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

const sampleModels: Choice[] = [
	{ id: "claude-3-7-sonnet", name: "Claude 3.7 Sonnet" },
	{ id: "gpt-4o", name: "GPT-4o" },
	{ id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
];

describe("TranscriptView - User Message", () => {
	it("renders user message right-aligned with rounded bubble and action buttons", async () => {
		const blocks: Block[] = [{ kind: "user", key: "b0", text: "Hello world" }];
		const root = mount(() => (
			<>
				<Toaster />
				<TranscriptView blocks={blocks} running={false} onApprove={() => {}} />
			</>
		));
		flush();

		const userWrapper = root.querySelector(".group\\/user");
		expect(userWrapper).not.toBeNull();
		expect(userWrapper?.className).toContain("flex-col items-end");

		const bubble = userWrapper?.querySelector(".rounded-2xl.rounded-br-sm");
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

		const noteBtn = userWrapper?.querySelector<HTMLButtonElement>(
			'button[aria-label="Add as note"]',
		);
		expect(noteBtn).not.toBeNull();
		expect(noteBtn?.getAttribute("title")).toBe("Add as note");

		noteBtn?.click();
		flush();
		expect(root.querySelector("output[aria-live=polite]")?.textContent).toContain(
			"Saved to notes (feature coming soon)",
		);
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
	it("renders response with copy, handover, note, and regenerate actions", () => {
		const onHandover = vi.fn();
		const onRegenerate = vi.fn();

		const blocks: Block[] = [
			{ kind: "user", key: "b0", text: "Write some code" },
			{ kind: "assistant", key: "b1", text: "Here is your code" },
		];

		const root = mount(() => (
			<>
				<Toaster />
				<TranscriptView
					blocks={blocks}
					running={false}
					models={sampleModels}
					currentModel="claude-3-7-sonnet"
					onApprove={() => {}}
					onHandover={onHandover}
					onRegenerate={onRegenerate}
				/>
			</>
		));
		flush();

		const assistantWrapper = root.querySelector(".group\\/assistant");
		expect(assistantWrapper).not.toBeNull();

		// Copy response
		const copyBtn = assistantWrapper?.querySelector<HTMLButtonElement>(
			'button[aria-label="Copy response"]',
		);
		expect(copyBtn).not.toBeNull();
		expect(copyBtn?.getAttribute("title")).toBe("Copy");
		copyBtn?.click();
		expect(navigator.clipboard.writeText).toHaveBeenCalledWith("Here is your code");

		// Note button
		const noteBtn = assistantWrapper?.querySelector<HTMLButtonElement>(
			'button[aria-label="Add as note"]',
		);
		expect(noteBtn).not.toBeNull();
		noteBtn?.click();
		flush();
		expect(root.querySelector("output[aria-live=polite]")?.textContent).toContain(
			"Saved to notes (feature coming soon)",
		);

		// Handover menu trigger
		const handoverTrigger = assistantWrapper?.querySelector<HTMLButtonElement>(
			'button[aria-label="Handover to model"]',
		);
		expect(handoverTrigger).not.toBeNull();

		// Handover menu items
		const menuItems = root.querySelectorAll('button[role="menuitem"]');
		expect(menuItems.length).toBe(sampleModels.length);

		// Current model should be disabled
		const currentItem = [...menuItems].find((el) => el.textContent?.includes("Claude 3.7 Sonnet"));
		expect(currentItem?.textContent).toContain("(current)");
		expect(currentItem?.hasAttribute("disabled")).toBe(true);

		// Click target model
		const targetItem = [...menuItems].find((el) =>
			el.textContent?.includes("GPT-4o"),
		) as HTMLButtonElement;
		expect(targetItem).toBeDefined();
		targetItem.click();
		expect(onHandover).toHaveBeenCalledWith("gpt-4o");

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
			<TranscriptView
				blocks={blocks}
				running={true}
				models={sampleModels}
				currentModel="claude-3-7-sonnet"
				onApprove={() => {}}
			/>
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
			<TranscriptView
				blocks={blocks}
				running={false}
				models={sampleModels}
				currentModel="claude-3-7-sonnet"
				onApprove={() => {}}
			/>
		));
		flush();

		const regenerateBtn = root.querySelector<HTMLButtonElement>(
			'button[aria-label="Regenerate response"]',
		);
		expect(regenerateBtn).toBeNull();
	});
});
