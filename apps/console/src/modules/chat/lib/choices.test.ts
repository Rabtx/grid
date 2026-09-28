import { describe, expect, it } from "vitest";

import {
	filterChoices,
	foldDefault,
	modelBlurb,
	findChoice,
	groupChoices,
	mergeModels,
	modeDescription,
	modeGlyph,
	shortModelName,
} from "./choices";

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

describe("findChoice", () => {
	it("finds by id and is null for an id the list does not carry", () => {
		expect(findChoice(models, "opencode/big-pickle")?.name).toBe("Big Pickle");
		expect(findChoice(models, "missing")).toBeNull();
		expect(findChoice(models, "")).toBeNull();
		expect(findChoice(models, null)).toBeNull();
		expect(findChoice([], "opus[1m]")).toBeNull();
	});
});

describe("modeGlyph", () => {
	it("draws each permission mode with its own glyph and keeps the lock for the rest", () => {
		expect(modeGlyph({ id: "default", name: "Ask" })).toBe("lock");
		expect(modeGlyph({ id: "supervised", name: "Supervised" })).toBe("lock");
		expect(modeGlyph({ id: "acceptEdits", name: "Accept edits" })).toBe("edit");
		expect(modeGlyph({ id: "accept-edits", name: "Accept edits" })).toBe("edit");
		expect(modeGlyph({ id: "plan", name: "Plan" })).toBe("plan");
		expect(modeGlyph({ id: "bypassPermissions", name: "Full access" })).toBe("open");
		expect(modeGlyph({ id: "full-access", name: "Full access" })).toBe("open");
		expect(modeGlyph({ id: "unheard-of", name: "Unheard of" })).toBe("lock");
		expect(modeGlyph(null)).toBe("lock");
	});
});

describe("modeDescription", () => {
	it("takes the agent's own line, else a line for the modes we know, else none", () => {
		expect(modeDescription({ id: "plan", name: "Plan", description: "The agent's words" })).toBe(
			"The agent's words",
		);
		expect(modeDescription({ id: "default", name: "Ask" })).toBe(
			"Ask before commands and file changes",
		);
		expect(modeDescription({ id: "full-access", name: "Full access" })).toBe(
			"Allow commands and edits without asking",
		);
		expect(modeDescription({ id: "custom", name: "Custom" })).toBeNull();
	});
});

describe("shortModelName", () => {
	it("drops the agent's default prefix and bracketed detail for the chip", () => {
		expect(shortModelName("Default · Opus 5.5 (1M context)")).toBe("Opus 5.5");
		expect(shortModelName("MiMo-V2.6-Flash Free")).toBe("MiMo-V2.6-Flash Free");
		expect(shortModelName("(beta)")).toBe("(beta)");
	});
});

describe("modelBlurb", () => {
	it("drops the model id a description starts with", () => {
		expect(
			modelBlurb({
				id: "x",
				name: "Opus",
				description: "claude-opus-5-5 · Best for everyday tasks",
			}),
		).toBe("Best for everyday tasks");
		expect(
			modelBlurb({ id: "x", name: "Sonnet", description: "Efficient · for routine tasks" }),
		).toBe("Efficient · for routine tasks");
		expect(modelBlurb({ id: "x", name: "None" })).toBeUndefined();
	});
});

describe("foldDefault", () => {
	it("keeps the default under its model's name and drops the duplicate", () => {
		const folded = foldDefault([
			{ id: "default", name: "Default · Opus 5.5 (1M context)" },
			{ id: "opus", name: "Opus 5.5 (1M context)" },
			{ id: "sonnet", name: "Sonnet 5" },
		]);
		expect(folded.choices.map((choice) => [choice.id, choice.name])).toEqual([
			["default", "Opus 5.5 (1M context)"],
			["sonnet", "Sonnet 5"],
		]);
		expect(folded.defaults.has("default")).toBe(true);
		expect(folded.aliases.get("default")).toBe("opus");
	});
});
