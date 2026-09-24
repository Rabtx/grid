// @vitest-environment happy-dom

import { flush } from "solid-js";
import { render } from "@solidjs/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toast, Toaster } from "./toast";

describe("Toaster", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("shows a toast with an action, then auto-dismisses it", () => {
		const container = document.createElement("div");
		document.body.append(container);
		const onClick = vi.fn();
		render(() => <Toaster />, container);

		toast({ message: "Added TASK-1", action: { label: "Open", onClick } });
		flush();

		expect(container.querySelector("output[aria-live=polite]")?.textContent).toContain(
			"Added TASK-1",
		);
		const open = [...container.querySelectorAll("button")].find(
			(button) => button.textContent?.trim() === "Open",
		);
		open?.click();
		expect(onClick).toHaveBeenCalledOnce();

		vi.advanceTimersByTime(4_000);
		flush();
		expect(container.querySelector("output[aria-live=polite]")?.textContent).not.toContain(
			"Added TASK-1",
		);
		container.remove();
	});

	it("dismisses when the close button is pressed", () => {
		const container = document.createElement("div");
		document.body.append(container);
		render(() => <Toaster />, container);

		toast({ message: "Saved settings" });
		flush();
		const close = container.querySelector<HTMLButtonElement>(
			'button[aria-label="Dismiss notification"]',
		);
		close?.click();
		flush();

		expect(container.querySelector("output[aria-live=polite]")?.textContent).not.toContain(
			"Saved settings",
		);
		container.remove();
	});
});
