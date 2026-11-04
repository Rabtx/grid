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

	function mount(start: string | null): { value: () => string | null; thumb: HTMLElement } {
		const container = document.createElement("div");
		document.body.append(container);
		const [value, setValue] = createSignal<string | null>(start);
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
		const thumb = container.querySelector<HTMLElement>('[role="slider"]');
		if (!thumb) throw new Error("no slider");
		return { value, thumb };
	}

	const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
	const key = (thumb: HTMLElement, name: string) =>
		thumb.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));

	it("is a stepped slider named by its label and level", () => {
		const { thumb } = mount("high");
		expect(thumb.getAttribute("aria-valuemax")).toBe("3");
		expect(thumb.getAttribute("aria-valuenow")).toBe("2");
		expect(thumb.getAttribute("aria-valuetext")).toBe("High");
		const label = document.getElementById(thumb.getAttribute("aria-labelledby") ?? "");
		expect(label?.textContent).toBe("Reasoning effort");
	});

	it("shows medium, marked recommended, while nothing is chosen", () => {
		const { thumb } = mount(null);
		expect(thumb.getAttribute("aria-valuetext")).toBe("Medium, recommended");
	});

	it("moves a step at a time with the arrows, and to the ends with Home and End", async () => {
		const { value, thumb } = mount("low");
		key(thumb, "ArrowRight");
		await settle();
		expect(value()).toBe("medium");
		key(thumb, "End");
		await settle();
		expect(value()).toBe("max");
		key(thumb, "Home");
		await settle();
		expect(value()).toBe("low");
	});
});
