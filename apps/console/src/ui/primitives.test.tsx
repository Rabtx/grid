import { render } from "@solidjs/web";
import { createSignal } from "solid-js";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { Button, IconButton } from "./button";
import { ConfirmDialog } from "./confirm-dialog";
import { EmptyState, ErrorNotice } from "./feedback";
import { Field, Input, Textarea } from "./field";
import { Menu } from "./menu";
import { SegmentedControl } from "./segmented-control";
import { Select } from "./select";

let dispose: (() => void) | undefined;
let container: HTMLElement;

function mount(view: () => ReturnType<typeof Button>): HTMLElement {
	container = document.createElement("div");
	document.body.append(container);
	dispose = render(view, container);
	return container;
}

beforeAll(() => {
	// happy-dom lacks the Popover and modal dialog APIs the Menu/ConfirmDialog rely on.
	if (!HTMLElement.prototype.showPopover) {
		HTMLElement.prototype.showPopover = vi.fn();
	}
	if (!HTMLElement.prototype.hidePopover) {
		HTMLElement.prototype.hidePopover = vi.fn();
	}
	if (!HTMLDialogElement.prototype.showModal) {
		HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
			this.open = true;
		});
	}
	if (!HTMLDialogElement.prototype.close) {
		HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
			this.open = false;
		});
	}
});

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

describe("Textarea", () => {
	it("forwards value and onInput", () => {
		const onInput = vi.fn();
		const root = mount(() => (
			<Textarea value="hello" onInput={(event) => onInput(event.currentTarget.value)} />
		));
		const textarea = root.querySelector("textarea");
		expect(textarea).not.toBeNull();
		expect(textarea?.className).toContain("min-h-24");
		expect(textarea?.className).toContain("resize-y");
		expect(textarea?.value).toBe("hello");
		textarea?.dispatchEvent(new Event("input", { bubbles: true }));
		expect(onInput).toHaveBeenCalledWith("hello");
	});
});

describe("Select", () => {
	it("renders options and calls onChange", () => {
		const onChange = vi.fn();
		const root = mount(() => {
			const [value, setValue] = createSignal("a");
			return (
				<Select
					aria-label="Pick"
					options={[
						{ value: "a", label: "Alpha" },
						{ value: "b", label: "Beta" },
					]}
					value={value()}
					onChange={(next) => {
						onChange(next);
						setValue(next);
					}}
				/>
			);
		});
		const select = root.querySelector("select");
		expect(select?.getAttribute("aria-label")).toBe("Pick");
		const options = root.querySelectorAll("option");
		expect(options.length).toBe(2);
		expect(options[0]?.textContent).toBe("Alpha");
		if (select) {
			select.value = "b";
			select.dispatchEvent(new Event("change", { bubbles: true }));
		}
		expect(onChange).toHaveBeenCalledWith("b");
	});
});

describe("Menu", () => {
	it("renders its items, marks the trigger with popovertarget, and calls onSelect", () => {
		const onSelect = vi.fn();
		const root = mount(() => (
			<Menu
				label="Move task"
				trigger={<span>⋯</span>}
				items={[
					{ id: "todo", label: "To do" },
					{ id: "done", label: "Done", danger: true },
				]}
				onSelect={onSelect}
			/>
		));
		const trigger = root.querySelector("button");
		expect(trigger?.getAttribute("aria-label")).toBe("Move task");
		expect(trigger?.getAttribute("popovertarget")).toBeTruthy();
		const list = root.querySelector("[popover]");
		expect(list?.id).toBe(trigger?.getAttribute("popovertarget"));
		expect(list?.getAttribute("role")).toBe("menu");
		const items = root.querySelectorAll('[role="menuitem"]');
		expect(items.length).toBe(2);
		expect(items[1]?.className).toContain("text-danger");
		(items[1] as HTMLButtonElement).click();
		expect(onSelect).toHaveBeenCalledWith("done");
	});
});

describe("ConfirmDialog", () => {
	it("calls onCancel from Cancel and onConfirm from the confirm button", () => {
		const onCancel = vi.fn();
		const onConfirm = vi.fn();
		const root = mount(() => (
			<ConfirmDialog
				open
				title="Delete TASK-1?"
				description="This can't be undone."
				confirmLabel="Delete task"
				tone="danger"
				onConfirm={onConfirm}
				onCancel={onCancel}
			/>
		));
		const buttons = [...root.querySelectorAll("button")];
		const cancel = buttons.find((b) => b.textContent === "Cancel");
		const confirm = buttons.find((b) => b.textContent === "Delete task");
		expect(cancel).toBeDefined();
		expect(confirm).toBeDefined();
		expect(confirm?.className).toContain("bg-danger");
		cancel?.click();
		expect(onCancel).toHaveBeenCalledTimes(1);
		confirm?.click();
		expect(onConfirm).toHaveBeenCalledTimes(1);
	});
});
