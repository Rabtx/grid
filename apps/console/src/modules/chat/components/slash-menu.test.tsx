import { render } from "@solidjs/web";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
	agentCommands,
	availableCommands,
	GRID_COMMANDS,
	type SlashCommand,
} from "../lib/slash-commands";

import { SlashMenu } from "./slash-menu";

const CONTEXT = {
	running: true,
	models: true,
	modes: true,
	efforts: true,
	project: true,
	split: true,
};

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

		expect(container.querySelectorAll('[role="option"]')).toHaveLength(GRID_COMMANDS.length);
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

	it("lists what a real agent reported, its own names and Grid's clashes apart", () => {
		// As Claude Code 2.1.280 answered, trimmed: its commands, and two whose names Grid has.
		const reported = [
			{ name: "compact", description: "Compact the conversation", hint: "<instructions>" },
			{ name: "design", description: "Make a new Design artifact", hint: "[what to design]" },
			{ name: "clear", description: "Clear the screen", hint: "[name]" },
			{ name: "model", description: "Select a model", hint: "<model>" },
		];
		mount(availableCommands(CONTEXT, agentCommands(reported, { id: "claude", name: "Claude" })));

		// Grid's group first, the agent's under it.
		const headings = [...container.querySelectorAll("li")]
			.map((item) => item.textContent)
			.filter((text) => text === "Grid" || text === "Claude");
		expect(headings).toEqual(["Grid", "Claude"]);
		// Grid's own names stay bare; the agent's carry its id, so the two cannot be confused.
		expect(container.textContent).toContain("/claude:clear");
		expect(container.textContent).toContain("/claude:model");
		expect(container.textContent).toContain("[what to design] — Make a new Design artifact");
		// It is a listbox of the whole menu, agent's own included.
		const options = container.querySelectorAll('[role="option"]');
		expect(options).toHaveLength(GRID_COMMANDS.length + reported.length);
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
