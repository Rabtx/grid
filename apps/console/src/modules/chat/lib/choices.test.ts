import { describe, expect, it } from "vitest";

import { filterChoices, groupChoices, mergeModels } from "./choices";

const models = [
	{ id: "opus[1m]", name: "Opus 5.5 (1M context)", description: "claude-opus-5-5" },
	{
		id: "opencode/big-pickle",
		name: "Big Pickle",
		group: "opencode",
		description: "free · 200K context",
	},
	{
		id: "openrouter/~anthropic/claude-fable-latest",
		name: "Claude Fable Latest",
		group: "openrouter",
	},
	{
		id: "openrouter/google/gemini-3.8-flash",
		name: "Gemini 3.8 Flash",
		group: "openrouter",
		description: "free",
	},
];

describe("filterChoices", () => {
	it("matches every word, in any order, across name, id, group and description", () => {
		expect(filterChoices(models, "opus 1m").map((model) => model.id)).toEqual(["opus[1m]"]);
		expect(filterChoices(models, "FREE flash").map((model) => model.id)).toEqual([
			"openrouter/google/gemini-3.8-flash",
		]);
		expect(filterChoices(models, "openrouter claude").map((model) => model.name)).toEqual([
			"Claude Fable Latest",
		]);
		expect(filterChoices(models, "  ")).toHaveLength(4);
		expect(filterChoices(models, "nothing like this")).toEqual([]);
	});
});

describe("groupChoices", () => {
	it("groups runs of the same provider under one heading", () => {
		expect(groupChoices(models).map((group) => [group.group, group.choices.length])).toEqual([
			[null, 1],
			["opencode", 1],
			["openrouter", 2],
		]);
	});
});

describe("mergeModels", () => {
	it("keeps the catalog and adds live models it lacks", () => {
		const merged = mergeModels(models.slice(0, 2), [
			{ id: "opus[1m]", name: "dup" },
			{ id: "new/model", name: "New" },
		]);
		expect(merged.map((model) => model.id)).toEqual([
			"opus[1m]",
			"opencode/big-pickle",
			"new/model",
		]);
	});
});
