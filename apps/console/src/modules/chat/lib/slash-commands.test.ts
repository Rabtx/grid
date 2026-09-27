import { describe, expect, it } from "vitest";

import {
	availableCommands,
	filterCommands,
	findSlashQuery,
	GRID_COMMANDS,
	insertCommand,
	parseSlashCommand,
	type SlashCommand,
} from "./slash-commands";

const CONTEXT = { running: true, models: true, modes: true, efforts: true, project: true };

const NOTHING = { running: false, models: false, modes: false, efforts: false, project: false };

const AGENT_COMMAND: SlashCommand = {
	id: "claude:compact",
	name: "compact",
	description: "Summarise the conversation",
	group: "Claude",
	kind: "agent",
};

function command(name: string): SlashCommand {
	const found = GRID_COMMANDS.find((candidate) => candidate.name === name);
	if (!found) throw new Error(`no Grid command named ${name}`);
	return found;
}

describe("findSlashQuery", () => {
	it("finds a slash at the start of the composer", () => {
		expect(findSlashQuery("/", 1)).toEqual({ slashIndex: 0, query: "" });
		expect(findSlashQuery("/tas", 4)).toEqual({ slashIndex: 0, query: "tas" });
	});

	it("allows leading whitespace before the slash", () => {
		expect(findSlashQuery("  /new", 6)).toEqual({ slashIndex: 2, query: "new" });
	});

	it("ignores a slash in the middle of a message", () => {
		expect(findSlashQuery("hello /new", 10)).toBeNull();
		expect(findSlashQuery("path/to", 7)).toBeNull();
	});

	it("closes once the argument starts", () => {
		expect(findSlashQuery("/task buy milk", 14)).toBeNull();
	});

	it("reads only up to the cursor", () => {
		expect(findSlashQuery("/task buy", 5)).toEqual({ slashIndex: 0, query: "task" });
	});
});

describe("filterCommands", () => {
	it("returns every command for an empty query", () => {
		expect(filterCommands(GRID_COMMANDS, "")).toHaveLength(GRID_COMMANDS.length);
	});

	it("matches names before descriptions", () => {
		expect(filterCommands(GRID_COMMANDS, "task")[0]?.name).toBe("task");
		expect(filterCommands(GRID_COMMANDS, "board").map((c) => c.name)).toContain("task");
	});

	it("matches a subsequence of the name", () => {
		expect(filterCommands(GRID_COMMANDS, "clr").map((c) => c.name)).toContain("clear");
	});

	it("drops commands that do not match", () => {
		expect(filterCommands(GRID_COMMANDS, "zzz")).toEqual([]);
	});
});

describe("parseSlashCommand", () => {
	const commands = [...GRID_COMMANDS, AGENT_COMMAND];

	it("reads a command with no argument", () => {
		const parsed = parseSlashCommand("/new", commands);
		expect(parsed?.command.name).toBe("new");
		expect(parsed?.argument).toBe("");
	});

	it("reads the argument after the name", () => {
		const parsed = parseSlashCommand("/task buy milk", commands);
		expect(parsed?.command.name).toBe("task");
		expect(parsed?.argument).toBe("buy milk");
	});

	it("leaves anything that is not a Grid command to the agent", () => {
		expect(parseSlashCommand("hello /new", commands)).toBeNull();
		expect(parseSlashCommand("/compact", commands)).toBeNull();
		expect(parseSlashCommand("/", commands)).toBeNull();
	});
});

describe("insertCommand", () => {
	it("takes a command that runs on its own out of the field", () => {
		expect(insertCommand("/clear", 0, 6, command("clear"))).toEqual({
			text: "",
			cursorPosition: 0,
		});
	});

	it("leaves a space and the cursor after a command that needs an argument", () => {
		expect(insertCommand("/ta", 0, 3, command("task"))).toEqual({
			text: "/task ",
			cursorPosition: 6,
		});
	});

	it("types an agent's own command out for the agent", () => {
		expect(insertCommand("/co", 0, 3, AGENT_COMMAND)).toEqual({
			text: "/compact ",
			cursorPosition: 9,
		});
	});
});

describe("availableCommands", () => {
	it("offers only /clear with no turn, catalog or project", () => {
		expect(availableCommands(NOTHING).map((c) => c.name)).toEqual(["clear"]);
	});

	it("offers Grid's whole set when everything is available", () => {
		expect(availableCommands(CONTEXT)).toHaveLength(GRID_COMMANDS.length);
	});

	it("hides /stop while nothing is running", () => {
		const names = availableCommands({ ...CONTEXT, running: false }).map((c) => c.name);
		expect(names).not.toContain("stop");
	});

	it("appends the agent's own commands under its name", () => {
		const commands = availableCommands(CONTEXT, [AGENT_COMMAND]);
		const last = commands.at(-1);
		expect(last).toEqual(AGENT_COMMAND);
		expect(last?.group).toBe("Claude");
		expect(last?.kind).toBe("agent");
	});
});
