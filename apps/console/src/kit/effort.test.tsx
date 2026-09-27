import { render } from "@solidjs/web";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";

import { EffortSlider } from "./effort";

const LEVELS = [
	{ id: "low", name: "Low" },
	{ id: "medium", name: "Medium" },
	{ id: "high", name: "High" },
	{ id: "max", name: "Max" },
];

describe("EffortSlider", () => {
	let dispose: (() => void) | undefined;
	afterEach(() => {
		dispose?.();
		document.body.replaceChildren();
	});

	function mount(start: string): { value: () => string; input: HTMLInputElement } {
		const container = document.createElement("div");
		document.body.append(container);
		const [value, setValue] = createSignal(start);
		dispose = render(
			() => (
				<EffortSlider
					label="Reasoning effort"
					levels={LEVELS}
					value={value()}
					onChange={setValue}
				/>
			),
			container,
		);
		const input = container.querySelector<HTMLInputElement>('input[type="range"]');
		if (!input) throw new Error("no slider");
		return { value, input };
	}

	/** Moves the slider as a drag or key would, then lets Solid apply the change. */
	async function slide(input: HTMLInputElement, to: number): Promise<void> {
		input.value = String(to);
		input.dispatchEvent(new Event("input", { bubbles: true }));
		await new Promise((resolve) => setTimeout(resolve, 0));
	}

	it("is a stepped range named by its level", () => {
		const { input } = mount("high");
		expect(input.max).toBe("3");
		expect(input.value).toBe("2");
		expect(input.getAttribute("aria-valuetext")).toBe("High");
		expect(document.querySelector("label")?.textContent).toBe("Reasoning effort");
	});

	it("bursts sparks going up, more at the top, and none coming down", async () => {
		const { value, input } = mount("low");
		await slide(input, 1);
		expect(value()).toBe("medium");
		const small = document.querySelectorAll(".kit-effort-spark").length;
		expect(small).toBeGreaterThan(0);
		await slide(input, 3);
		expect(value()).toBe("max");
		expect(document.querySelectorAll(".kit-effort-spark").length - small).toBeGreaterThan(small);
		const before = document.querySelectorAll(".kit-effort-spark").length;
		await slide(input, 0);
		expect(value()).toBe("low");
		expect(document.querySelectorAll(".kit-effort-spark").length).toBe(before);
	});

	it("runs hot only at the top level", async () => {
		const { input } = mount("high");
		expect(document.querySelector(".kit-effort-hot")).toBeNull();
		await slide(input, 3);
		expect(document.querySelector(".kit-effort-hot")).not.toBeNull();
	});

	it("picks a level from its name under the track", async () => {
		const { value } = mount("low");
		[...document.querySelectorAll("button")]
			.find((button) => button.textContent === "High")
			?.click();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(value()).toBe("high");
	});
});
