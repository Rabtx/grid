import { render } from "@solidjs/web";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Button, IconButton } from "./button";
import { EmptyState, ErrorNotice } from "./feedback";
import { Field, Input } from "./field";
import { SegmentedControl } from "./segmented-control";

let dispose: (() => void) | undefined;
let container: HTMLElement;

function mount(view: () => ReturnType<typeof Button>): HTMLElement {
	container = document.createElement("div");
	document.body.append(container);
	dispose = render(view, container);
	return container;
}

afterEach(() => {
	dispose?.();
	container?.remove();
});

describe("Button", () => {
	it("defaults to a non-submitting secondary button", () => {
		const root = mount(() => <Button>Save</Button>);
		const button = root.querySelector("button");
		expect(button?.getAttribute("type")).toBe("button");
		expect(button?.className).toContain("border-ink/10");
	});

	it("renders the primary variant, forwards handlers and honours disabled", () => {
		const onClick = vi.fn();
		const root = mount(() => (
			<>
				<Button variant="primary" onClick={onClick}>
					Go
				</Button>
				<Button variant="primary" disabled onClick={onClick}>
					Off
				</Button>
			</>
		));
		const [enabled, disabled] = root.querySelectorAll("button");
		expect(enabled.className).toContain("bg-primary");
		enabled.click();
		disabled.click();
		expect(onClick).toHaveBeenCalledTimes(1);
		expect(disabled.disabled).toBe(true);
	});
});

describe("IconButton", () => {
	it("names the control from its label", () => {
		const root = mount(() => <IconButton label="Close">x</IconButton>);
		const button = root.querySelector("button");
		expect(button?.getAttribute("aria-label")).toBe("Close");
		expect(button?.getAttribute("title")).toBe("Close");
	});
});

describe("Field", () => {
	it("shows the hint when there is no error, and the error instead of it", () => {
		const root = mount(() => (
			<>
				<Field label="Email" hint="We never share it.">
					<Input />
				</Field>
				<Field label="Branch" hint="Unused" error="Already exists">
					<Input />
				</Field>
			</>
		));
		const [ok, bad] = root.querySelectorAll("label");
		expect(ok.textContent).toContain("We never share it.");
		expect(bad.textContent).toContain("Already exists");
		expect(bad.textContent).not.toContain("Unused");
		// The label wraps the input, so it is labelled without ids.
		expect(ok.querySelector("input")).not.toBeNull();
	});
});

describe("SegmentedControl", () => {
	it("marks the active option and reports changes", () => {
		const onChange = vi.fn();
		const root = mount(() => {
			const [value, setValue] = createSignal<"a" | "b">("a");
			return (
				<SegmentedControl
					label="View"
					options={[
						{ value: "a", label: "A" },
						{ value: "b", label: "B" },
					]}
					value={value()}
					onChange={(next) => {
						onChange(next);
						setValue(next);
					}}
				/>
			);
		});
		const [a, b] = root.querySelectorAll("button");
		expect(a.getAttribute("aria-pressed")).toBe("true");
		expect(b.getAttribute("aria-pressed")).toBe("false");
		b.click();
		expect(onChange).toHaveBeenCalledWith("b");
		expect(root.querySelector("legend")?.textContent).toBe("View");
	});
});

describe("feedback", () => {
	it("renders an error as an alert with its action, and an empty state with its sentence", () => {
		const root = mount(() => (
			<>
				<ErrorNotice message="The API could not be reached." action={<Button>Retry</Button>} />
				<EmptyState title="No tasks yet" description="Tasks you add show up here." />
			</>
		));
		const alert = root.querySelector('[role="alert"]');
		expect(alert?.textContent).toContain("The API could not be reached.");
		expect(alert?.querySelector("button")?.textContent).toBe("Retry");
		expect(root.textContent).toContain("Tasks you add show up here.");
	});
});
