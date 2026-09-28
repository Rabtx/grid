import { render } from "@solidjs/web";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Menu, MenuList, type MenuGroup } from "./menu";

const GROUPS: MenuGroup[] = [
	{
		label: "Files",
		items: [
			{ id: "files", label: "Add files or photos" },
			{ id: "photo", label: "Take a photo" },
		],
	},
	{
		label: "Actions",
		items: [
			{ id: "mention", label: "Mention a file" },
			{ id: "commands", label: "Commands" },
			{ id: "disabled", label: "Disabled item", disabled: true },
		],
	},
];

describe("Menu and MenuList", () => {
	let dispose: (() => void) | undefined;

	afterEach(() => {
		dispose?.();
		document.body.replaceChildren();
	});

	function mountList(onSelect = vi.fn(), onClose = vi.fn()) {
		const container = document.createElement("div");
		document.body.append(container);
		dispose = render(
			() => <MenuList groups={GROUPS} onSelect={onSelect} onClose={onClose} />,
			container,
		);
		const menu = container.querySelector<HTMLDivElement>('[role="menu"]')!;
		return { container, menu, onSelect, onClose };
	}

	it("renders menuitems with proper roles and autofocuses first enabled item", async () => {
		const { menu } = mountList();
		await new Promise((r) => requestAnimationFrame(r));
		const items = menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
		expect(items.length).toBe(5);
		expect(items[0].textContent).toContain("Add files or photos");
		expect(document.activeElement).toBe(items[0]);
	});

	it("navigates down, up, home and end with keyboard", async () => {
		const { menu } = mountList();
		await new Promise((r) => requestAnimationFrame(r));
		const items = menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');

		// ArrowDown moves to next item
		menu.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
		expect(document.activeElement).toBe(items[1]);

		// ArrowDown again moves to mention (skips nothing here)
		menu.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
		expect(document.activeElement).toBe(items[2]);

		// ArrowDown again moves to commands
		menu.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
		expect(document.activeElement).toBe(items[3]);

		// ArrowDown skips disabled item and wraps to first item
		menu.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
		expect(document.activeElement).toBe(items[0]);

		// ArrowUp wraps to last enabled item (commands)
		menu.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
		expect(document.activeElement).toBe(items[3]);

		// Home moves to first item
		menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
		expect(document.activeElement).toBe(items[0]);

		// End moves to last enabled item
		menu.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
		expect(document.activeElement).toBe(items[3]);
	});

	it("calls onSelect on click and onClose on Escape", async () => {
		const onSelect = vi.fn();
		const onClose = vi.fn();
		const { menu } = mountList(onSelect, onClose);
		await new Promise((r) => requestAnimationFrame(r));

		const items = menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
		items[1].click();
		expect(onSelect).toHaveBeenCalledWith("photo");

		menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		expect(onClose).toHaveBeenCalled();
	});

	it("returns focus to trigger button when popover is closed", async () => {
		const container = document.createElement("div");
		document.body.append(container);
		const onSelect = vi.fn();

		dispose = render(
			() => (
				<Menu
					label="Add"
					triggerClass="trigger-btn"
					trigger={<span>+</span>}
					groups={GROUPS}
					onSelect={onSelect}
				/>
			),
			container,
		);

		const trigger = container.querySelector<HTMLButtonElement>("button.trigger-btn")!;
		expect(trigger).not.toBeNull();

		// Open popover by clicking trigger
		trigger.click();
		await new Promise((r) => requestAnimationFrame(r));

		// Verify menu items are present
		const menu = container.querySelector<HTMLDivElement>('[role="menu"]')!;
		expect(menu).not.toBeNull();

		// Click an item to select and close
		const item = menu.querySelector<HTMLButtonElement>('[role="menuitem"]')!;
		item.click();
		await new Promise((r) => requestAnimationFrame(r));

		expect(onSelect).toHaveBeenCalledWith("files");
		expect(document.activeElement).toBe(trigger);
	});
});
