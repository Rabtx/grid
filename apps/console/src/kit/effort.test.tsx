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

	const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
	const pressed = () =>
		[...document.querySelectorAll("button[aria-pressed='true']")].map((b) => b.textContent);

	it("is a stepped range named by its level, for keys and screen readers", () => {
		const { input } = mount("high");
		expect(input.max).toBe("3");
		expect(input.value).toBe("2");
		expect(input.getAttribute("aria-valuetext")).toBe("High");
		expect(document.querySelector("label")?.textContent).toBe("Reasoning effort");
	});

	it("raises the chosen segment and says what the level means", async () => {
		const { value, input } = mount("low");
		expect(pressed()).toEqual(["Low"]);
		expect(document.body.textContent).toContain("Quick, light thinking");
		input.value = "2";
		input.dispatchEvent(new Event("input", { bubbles: true }));
		await settle();
		expect(value()).toBe("high");
		expect(pressed()).toEqual(["High"]);
		expect(document.body.textContent).toContain("Thinks it through");
	});

	it("picks a level from its segment", async () => {
		const { value } = mount("low");
		[...document.querySelectorAll("button")]
			.find((button) => button.textContent === "Max")
			?.click();
		await settle();
		expect(value()).toBe("max");
	});
});
