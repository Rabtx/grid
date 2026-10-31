import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ContextMeter, formatTokens } from "./context-panel";

describe("ContextMeter", () => {
	let dispose: (() => void) | undefined;
	afterEach(() => {
		dispose?.();
		document.body.replaceChildren();
	});

	function mount(view: () => ReturnType<typeof ContextMeter>): HTMLElement {
		const host = document.createElement("div");
		document.body.append(host);
		dispose = render(view, host);
		flush();
		return host;
	}

	/** Open the panel as the browser would: the popover turns open and says so. */
	function open(host: HTMLElement): void {
		const panel = host.querySelector<HTMLElement>("[popover]");
		if (!panel) throw new Error("no panel");
		Object.defineProperty(panel, "matches", {
			value: (selector: string) => selector === ":popover-open",
		});
		panel.dispatchEvent(new Event("toggle"));
		flush();
	}

	it("names how many tokens of how many on its trigger", () => {
		const host = mount(() => <ContextMeter used={76_000} total={200_000} />);
		expect(host.querySelector("button")?.getAttribute("aria-label")).toBe(
			"Context 38% · 76k of 200k tokens",
		);
	});

	it("shows the window, the plan's limits with their resets, the thread and a compact button", () => {
		const onCompact = vi.fn();
		const host = mount(() => (
			<ContextMeter
				used={150_000}
				total={200_000}
				model="Opus 5.5"
				account="Your sign-in"
				limits={[
					{ window: "5h", used: 42, limited: false, resets: "in 2h 10m · Sat 14:00" },
					{ window: "Weekly", used: 100, limited: true, resets: "in 3d · Tue 09:00" },
				]}
				carryOn="Grid carries this thread on when the limit resets."
				thread={{ input: 1_200_000, output: 34_000, cost: 1.5 }}
				onCompact={onCompact}
			/>
		));
		open(host);
		const text = host.textContent ?? "";
		expect(text).toContain("Opus 5.5");
		expect(text).toContain("150k / 200k");
		expect(text).toContain("75% used");
		expect(text).toContain("50k tokens left.");
		expect(text).toContain("42% used");
		expect(text).toContain("Resets in 2h 10m · Sat 14:00");
		expect(text).toContain("Used up");
		expect(text).toContain("Available again: in 3d · Tue 09:00");
		expect(text).toContain("Grid carries this thread on when the limit resets.");
		expect(text).toContain("1.2M");
		expect(text).toContain("$1.50");
		[...host.querySelectorAll("button")].find((b) => b.textContent === "Compact")?.click();
		expect(onCompact).toHaveBeenCalledOnce();
	});

	it("says what is not known yet, and why compacting must wait", () => {
		const host = mount(() => (
			<ContextMeter
				total={1_000_000}
				onCompact={() => {}}
				compactBlocked="Compacting waits until the agent finishes this turn."
			/>
		));
		open(host);
		const text = host.textContent ?? "";
		expect(text).toContain("1.0M");
		expect(text).toContain("Nothing used yet");
		expect(text).toContain("Limits show here once the agent reports them");
		expect(text).toContain("Compacting waits until the agent finishes this turn.");
		const compact = [...host.querySelectorAll("button")].find((b) => b.textContent === "Compact");
		expect(compact?.disabled).toBe(true);
	});

	it("leaves the compact button out where the agent cannot compact", () => {
		const host = mount(() => <ContextMeter total={200_000} />);
		open(host);
		expect([...host.querySelectorAll("button")].some((b) => b.textContent === "Compact")).toBe(
			false,
		);
	});

	it("says tokens as people say them", () => {
		expect([formatTokens(950), formatTokens(76_400), formatTokens(1_200_000)]).toEqual([
			"950",
			"76k",
			"1.2M",
		]);
	});
});
