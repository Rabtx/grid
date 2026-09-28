import { describe, expect, it } from "bun:test";

import { agentCommand, agentCommands } from "./commands";

describe("agentCommand", () => {
	it("keeps what the agent reported: name, description and argument hint", () => {
		expect(
			agentCommand({ name: "compact", description: "Summarise the conversation", input: null }),
		).toEqual({ name: "compact", description: "Summarise the conversation" });
		expect(
			agentCommand({
				name: "design",
				description: "Make a new Design artifact",
				input: { hint: "[what to design]" },
			}),
		).toEqual({
			name: "design",
			description: "Make a new Design artifact",
			hint: "[what to design]",
		});
		expect(agentCommand({ name: "run", description: "Run a skill", hint: "<skill>" })).toEqual({
			name: "run",
			description: "Run a skill",
			hint: "<skill>",
		});
	});

	it("keeps a colon in a name, which agents use to namespace their own", () => {
		expect(agentCommand({ name: "anthropic-skills:docs", description: "Word documents" })).toEqual({
			name: "anthropic-skills:docs",
			description: "Word documents",
		});
	});

	it("drops a name a person could not type, or one with nothing to say", () => {
		for (const entry of [
			{ name: "", description: "nothing" },
			{ name: "two words", description: "a space is not typeable after a slash" },
			{ name: "drop\nline", description: "a newline" },
			{ name: "<html>", description: "markup" },
			{ name: "x".repeat(65), description: "too long" },
			{ name: "compact" },
			{ name: "compact", description: "   " },
			{ name: 42, description: "not a string" },
			null,
			"compact",
		]) {
			expect(agentCommand(entry)).toBeNull();
		}
	});

	it("caps a runaway description and hint, and folds their whitespace flat", () => {
		const long = agentCommand({
			name: "canvas",
			description: `line one\nline two${" and more".repeat(60)}`,
			input: { hint: "x".repeat(300) },
		});
		expect(long?.description.length).toBe(200);
		expect(long?.description).toBe(`line one line two${" and more".repeat(38)}`.slice(0, 200));
		expect(long?.hint?.length).toBe(120);
	});
});

describe("agentCommands", () => {
	it("reads a whole list in the order the agent gave it", () => {
		expect(
			agentCommands([
				{ name: "compact", description: "Summarise" },
				{ name: "clear", description: "Clear the screen" },
			]),
		).toEqual([
			{ name: "compact", description: "Summarise" },
			{ name: "clear", description: "Clear the screen" },
		]);
	});

	it("lists a repeated name once, keeping the first", () => {
		expect(
			agentCommands([
				{ name: "compact", description: "First" },
				{ name: "other", description: "Other" },
				{ name: "compact", description: "Second" },
			]),
		).toEqual([
			{ name: "compact", description: "First" },
			{ name: "other", description: "Other" },
		]);
	});

	it("skips what it cannot show and keeps the rest", () => {
		expect(
			agentCommands([
				{ name: "ok", description: "Fine" },
				{ name: "bad name", description: "A space" },
				{ name: "quiet" },
				null,
				{ name: "also-ok", description: "Fine too" },
			]).map((command) => command.name),
		).toEqual(["ok", "also-ok"]);
	});

	it("keeps a menu's worth and no more", () => {
		const many = Array.from({ length: 500 }, (_, index) => ({
			name: `command-${index}`,
			description: "One of many",
		}));
		expect(agentCommands(many)).toHaveLength(200);
		expect(agentCommands(many).at(-1)?.name).toBe("command-199");
	});

	it("gives no commands for an empty or malformed list, rather than an error", () => {
		expect(agentCommands(undefined)).toEqual([]);
		expect(agentCommands(null)).toEqual([]);
		expect(agentCommands({ commands: [] })).toEqual([]);
		expect(agentCommands("compact")).toEqual([]);
		expect(agentCommands([])).toEqual([]);
	});
});
