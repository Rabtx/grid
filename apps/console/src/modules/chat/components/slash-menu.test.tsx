import { render } from "@solidjs/web";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GRID_COMMANDS, type SlashCommand } from "../lib/slash-commands";

import { SlashMenu } from "./slash-menu";

const AGENT_COMMAND: SlashCommand = {
	id: "claude:compact",
	name: "compact",
	description: "Summarise the conversation",
	group: "Claude",
	kind: "agent",
};

describe("SlashMenu", () => {
	let container: HTMLElement;
	let dispose: () => void;

	afterEach(() => {
		dispose?.();
		container?.remove();
	});

	function mount(
		commands: readonly SlashCommand[],
		selectedIndex = 0,
		onSelect: (command: SlashCommand) => void = () => {},
	): void {
		container = document.createElement("div");
		document.body.append(container);
		dispose = render(
			() => (
				<SlashMenu
					id="commands"
					commands={commands}
					selectedIndex={selectedIndex}
					onSelect={onSelect}
				/>
			),
			container,
		);
	}

	it("lists Grid's commands with their argument hint", () => {
		mount(GRID_COMMANDS);

		expect(container.textContent).toContain("Commands · 8");
		expect(container.textContent).toContain("/new");
		expect(container.textContent).toContain("/task");
		expect(container.textContent).toContain("<title>");
		expect(container.textContent).toContain("Grid");
	});

	it("lists the agent's own commands under its name", () => {
		mount([...GRID_COMMANDS, AGENT_COMMAND]);

		const headings = [...container.querySelectorAll("li")].map((item) => item.textContent);
		expect(headings).toContain("Grid");
		expect(headings).toContain("Claude");
		expect(container.textContent).toContain("/compact");
	});

	it("marks the selected command as current", () => {
		mount(GRID_COMMANDS, 1);

		const items = container.querySelectorAll('[role="option"]');
		expect(items[0].getAttribute("aria-selected")).toBe("false");
		expect(items[1].getAttribute("aria-selected")).toBe("true");
	});

	it("picks the command that was tapped", () => {
		const onSelect = vi.fn();
		mount(GRID_COMMANDS, 0, onSelect);

		const button = [...container.querySelectorAll<HTMLElement>('[role="option"]')].find((item) =>
			item.textContent?.includes("/note"),
		);
		button?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

		expect(onSelect).toHaveBeenCalledWith(GRID_COMMANDS.find((command) => command.name === "note"));
	});

	it("says so when nothing matches", () => {
		mount([]);

		expect(container.textContent).toContain("No matching commands");
	});
});
