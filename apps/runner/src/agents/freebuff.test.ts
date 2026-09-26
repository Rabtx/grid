import { describe, expect, it } from "bun:test";

import { freebuffMenu, freebuffReply } from "./freebuff";

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
});
