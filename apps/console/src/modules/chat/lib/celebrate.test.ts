import { describe, expect, it } from "vitest";

import { isFlagship, labOf } from "./celebrate";

const model = (name: string, id = name.toLowerCase().replaceAll(" ", "-")) => ({ id, name });

describe("isFlagship", () => {
	it("celebrates each lab's top tier", () => {
		for (const name of [
			"Opus 5.5",
			"Default · Opus 5.5 (1M context)",
			"GPT-5.5",
			"GPT-5",
			"Astra",
			"Gemini 3.8 Pro",
			"Gemini Ultra",
			"Grok 4",
		])
			expect(isFlagship(model(name)), name).toBe(true);
	});

	it("leaves the small, fast and older ones alone", () => {
		for (const name of [
			"Sonnet 5",
			"Haiku 4.5",
			"GPT-5 mini",
			"GPT-5 nano",
			"Gemini 3.8 Flash",
			"Grok 4 Fast",
			"MiMo-V2.6-Flash Free",
		])
			expect(isFlagship(model(name)), name).toBe(false);
	});

	it("reads the id too, for agents that name models by id", () => {
		expect(isFlagship({ id: "claude-opus-5-5", name: "Default" })).toBe(true);
	});
});

describe("labOf", () => {
	it("gives each lab its own colours and name", () => {
		expect(labOf(model("Opus 5.5")).lab).toBe("Anthropic");
		expect(labOf(model("GPT-5.5")).lab).toBe("OpenAI");
		expect(labOf(model("Astra")).lab).toBe("OpenAI");
		expect(labOf(model("Gemini 3.8 Pro")).hues).toEqual([214, 282]);
		expect(labOf({ id: "x", name: "Mystery", group: "Acme" }).lab).toBe("Acme");
	});
});
