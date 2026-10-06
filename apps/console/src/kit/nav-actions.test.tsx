import { render } from "@solidjs/web";
import { describe, expect, it } from "vitest";

import { Menu } from "./menu";
import { NavButton, NavLink } from "./nav";
import type { PopoverControl } from "./popover";

/**
 * A row's actions are JSX passed as a prop, and Solid builds JSX props each time they are read.
 * Read more than once (to test whether there are any, to pick padding), each read made another
 * menu that handed over its control. The control kept was then from a menu that was never on the
 * page, so right-click and long press opened nothing.
 */
describe("row actions", () => {
	for (const [name, Row] of [
		["NavButton", NavButton],
		["NavLink", NavLink],
	] as const) {
		it(`${name} builds its actions once, and its menu opens from code`, () => {
			const container = document.createElement("div");
			document.body.append(container);
			let built = 0;
			let menu: PopoverControl | undefined;
			const dispose = render(
				() => (
					<Row
						label="Row"
						trailingAction={<span>v</span>}
						actions={
							<Menu
								label="Row options"
								triggerClass="trigger"
								trigger={<span>...</span>}
								groups={[{ items: [{ id: "rename", label: "Rename" }] }]}
								onSelect={() => {}}
								control={(control) => {
									built++;
									menu = control;
								}}
							/>
						}
					/>
				),
				container,
			);
			try {
				expect(built).toBe(1);
				const panel = container.querySelector<HTMLElement>("[popover]");
				expect(panel?.isConnected).toBe(true);
				menu?.open({ x: 10, y: 10 });
				expect(panel?.matches(":popover-open")).toBe(true);
			} finally {
				dispose();
				container.remove();
			}
		});
	}
});
