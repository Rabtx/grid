import { describe, expect, it } from "vitest";

import { promptParts } from "./prompt-tokens";

const COMMANDS = new Set(["model", "clear"]);

describe("promptParts", () => {
	it("marks a known command at the start and the mentions after it", () => {
		expect(promptParts("/model fix @src/app.tsx now", COMMANDS)).toEqual([
			{ text: "/model", kind: "command" },
			{ text: " fix ", kind: "plain" },
			{ text: "@src/app.tsx", kind: "mention" },
			{ text: " now", kind: "plain" },
		]);
	});

	it("leaves an unknown command, a mid-word @ and a lone @ plain", () => {
		expect(promptParts("/nope a@b.com @", COMMANDS)).toEqual([
			{ text: "/nope a@b.com @", kind: "plain" },
		]);
	});

	it("finds a mention at the very start and on a new line", () => {
		expect(promptParts("@a.ts\n@b.ts", COMMANDS)).toEqual([
			{ text: "@a.ts", kind: "mention" },
			{ text: "\n", kind: "plain" },
			{ text: "@b.ts", kind: "mention" },
		]);
	});

	it("keeps every character, so the copy under the field lines up", () => {
		const text = "/clear  @x  y\n\n@z";
		expect(
			promptParts(text, COMMANDS)
				.map((part) => part.text)
				.join(""),
		).toBe(text);
	});
});
