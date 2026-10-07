import { render } from "@solidjs/web";
import { describe, expect, it, vi } from "vitest";

import { Dialog } from "./dialog";

function mount(onSubmit?: () => void) {
	const container = document.createElement("div");
	document.body.append(container);
	const dispose = render(
		() => (
			<Dialog open={false} onClose={() => {}} title="Add log source" onSubmit={onSubmit}>
				<input aria-label="Name" />
				<textarea aria-label="Notes" />
			</Dialog>
		),
		container,
	);
	const key = (selector: string, init: KeyboardEventInit) =>
		container
			.querySelector(selector)
			?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, ...init }));
	return { key, cleanup: () => (dispose(), container.remove()) };
}

describe("Dialog onSubmit", () => {
	it("submits on Enter in a field, as a form does", () => {
		const onSubmit = vi.fn();
		const { key, cleanup } = mount(onSubmit);
		key("input", {});
		expect(onSubmit).toHaveBeenCalledTimes(1);
		cleanup();
	});

	it("leaves Enter alone in a textarea, with Shift, while composing, or without onSubmit", () => {
		const onSubmit = vi.fn();
		const { key, cleanup } = mount(onSubmit);
		key("textarea", {});
		key("input", { shiftKey: true });
		key("input", { isComposing: true });
		expect(onSubmit).not.toHaveBeenCalled();
		cleanup();
		const bare = mount();
		expect(() => bare.key("input", {})).not.toThrow();
		bare.cleanup();
	});
});
