import { describe, expect, it } from "bun:test";

import { freebuffMenu, freebuffProgress, freebuffReply } from "./freebuff";

describe("Freebuff CLI screen", () => {
	it("reads the model picker from rendered terminal lines", () => {
		const screen = [
			"│   GLM 5.3 Flash · Deep reasoning · NEW  │",
			"│                 5 Freebucks/hr          │",
			"│ › DeepSeek V4.1 Flash · Smart & Fast    │",
			"│                15 Freebucks/hr          │",
		].join("\n");
		expect(freebuffMenu(screen)).toEqual({
			models: [
				{ id: "GLM 5.3 Flash", name: "GLM 5.3 Flash", description: "5 Freebucks/hr" },
				{ id: "DeepSeek V4.1 Flash", name: "DeepSeek V4.1 Flash", description: "15 Freebucks/hr" },
			],
			selected: 1,
		});
	});

	it("extracts the answer after visible thinking", () => {
		const screen = [
			"Reply with only hello. ⎘",
			"",
			"• Thinking",
			"  The user requested one word.",
			"",
			"hello",
			"                                ⎘ • 5s • △▽",
			"│  ▍Enter a coding task or / for commands",
		].join("\n");
		expect(freebuffReply(screen, "Reply with only hello.")).toBe("hello");
		expect(freebuffReply(screen, "Another prompt")).toBeNull();
	});

	it("reads a growing answer before the final reply marker", () => {
		const screen = [
			"Write four lines. ⎘",
			"A blinking cursor waits in the dark, patient and quiet.",
			"Hidden text flows in a steady, ordered stream.",
			"The window is raw and unfiltered, a",
			"working... 3s ■ Esc",
			"│  ▍Enter a coding task or / for commands",
		].join("\n");
		expect(freebuffProgress(screen, "Write four lines.")).toBe(
			"A blinking cursor waits in the dark, patient and quiet.\nHidden text flows in a steady, ordered stream.\nThe window is raw and unfiltered, a",
		);
		expect(freebuffReply(screen, "Write four lines.")).toBeNull();
	});
});
