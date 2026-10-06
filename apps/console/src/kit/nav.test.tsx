import { render } from "@solidjs/web";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Menu } from "./menu";
import { NavButton, NavLink } from "./nav";
import type { PopoverControl } from "./popover";

/**
 * Touch gestures, as a finger makes them: happy-dom has no `TouchEvent`, so these build the
 * event `attachContextMenu` listens for — a `touchstart` carrying one touch at a point.
 */
function touchAt(type: string, x: number, y: number): Event {
	const event = new Event(type, { bubbles: true, cancelable: true }) as Event & {
		touches: { clientX: number; clientY: number }[];
	};
	event.touches = [{ clientX: x, clientY: y }];
	return event;
}

type RowProps = Partial<Parameters<typeof NavButton>[0]>;

function mount(props: RowProps & { onMenuSelect?: () => void } = {}) {
	const container = document.createElement("div");
	document.body.append(container);
	let menu: PopoverControl | undefined;
	const dispose = render(
		() => (
			<NavButton
				label="Row"
				onMenuAt={(point) => menu?.open(point)}
				actions={
					<Menu
						label="Row options"
						pointerOnly
						triggerClass="trigger"
						trigger={<span>...</span>}
						groups={[{ items: [{ id: "rename", label: "Rename" }] }]}
						onSelect={props.onMenuSelect ?? vi.fn()}
						control={(control) => {
							menu = control;
						}}
					/>
				}
				trailingAction={<button type="button">v</button>}
				{...props}
			/>
		),
		container,
	);
	const frame = container.querySelector<HTMLElement>(".group\\/row") as HTMLElement;
	return { container, frame, dispose, panel: () => container.querySelector("[popover]") };
}

describe("nav row touch and pointer affordances", () => {
	let dispose = () => {};

	afterEach(() => {
		dispose();
		document.body.replaceChildren();
		vi.useRealTimers();
	});

	it("leaves the actions mounted on touch, but only hides the triggers, never the container", () => {
		const view = mount();
		dispose = view.dispose;
		const actions = view.frame.querySelector<HTMLElement>(
			".group\\/row > div > div",
		) as HTMLElement;
		expect(actions.className).not.toContain("pointer-coarse:hidden");
		// Not `pointer-events: none` either: a menu opens inside this element and would inherit it,
		// leaving every item in the sheet untappable.
		expect(actions.className).not.toContain("pointer-coarse:pointer-events-none");
		expect(actions.className).toContain("pointer-coarse:[&>button]:hidden");
	});

	it("opens the row's menu from a long press, and a short press does not", async () => {
		vi.useFakeTimers();
		const onMenuSelect = vi.fn();
		const view = mount({ onMenuSelect });
		dispose = view.dispose;
		const open = vi.spyOn(view.frame, "getBoundingClientRect");

		// A tap: down and up well before the long press is due, and the row's own menu stays shut.
		view.frame.dispatchEvent(touchAt("touchstart", 20, 20));
		await vi.advanceTimersByTimeAsync(100);
		view.frame.dispatchEvent(touchAt("touchend", 20, 20));
		await vi.advanceTimersByTimeAsync(500);
		expect(view.container.querySelector('[role="menu"]')).toBeNull();

		// A long press: the finger rests, so the menu opens under it.
		view.frame.dispatchEvent(touchAt("touchstart", 20, 20));
		await vi.advanceTimersByTimeAsync(500);
		view.frame.dispatchEvent(touchAt("touchend", 20, 20));
		await vi.advanceTimersByTimeAsync(1);
		expect(view.container.querySelector('[role="menu"]')).not.toBeNull();
		open.mockRestore();
	});

	it("cancels a long press that turns into a scroll", async () => {
		vi.useFakeTimers();
		const view = mount();
		dispose = view.dispose;

		view.frame.dispatchEvent(touchAt("touchstart", 20, 20));
		await vi.advanceTimersByTimeAsync(100);
		// The finger moves: this is a scroll, not a press on the row.
		view.frame.dispatchEvent(touchAt("touchmove", 20, 80));
		await vi.advanceTimersByTimeAsync(500);
		view.frame.dispatchEvent(touchAt("touchend", 20, 80));
		await vi.advanceTimersByTimeAsync(1);
		expect(view.container.querySelector('[role="menu"]')).toBeNull();
	});

	it("hides the trailing control at rest on pointers and keeps it on touch", () => {
		const view = mount();
		dispose = view.dispose;
		const trailing = view.frame.querySelector<HTMLElement>(
			".group\\/row > div > div:last-child",
		) as HTMLElement;
		expect(trailing.className).toContain("opacity-0");
		expect(trailing.className).toContain("group-hover/row:opacity-100");
		expect(trailing.className).toContain("group-focus-within/row:opacity-100");
		// Touch has no hover to reveal it, so it is drawn there.
		expect(trailing.className).toContain("pointer-coarse:opacity-100");
	});

	it("leaves the trailing control reachable by keyboard", () => {
		const container = document.createElement("div");
		document.body.append(container);
		dispose = render(
			() => <NavLink href="#" label="Row" trailingAction={<button type="button">v</button>} />,
			container,
		);
		const trailing = container.querySelector<HTMLElement>(
			".group\\/row > div > div",
		) as HTMLElement;
		expect(trailing.className).toContain("group-focus-within/row:opacity-100");
		expect(trailing.querySelector("button")).not.toBeNull();
	});
});
