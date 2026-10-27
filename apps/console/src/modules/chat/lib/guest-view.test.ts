import { describe, expect, it } from "vitest";

import { guestBlocks } from "./guest-view";

describe("a shared thread, as a guest reads it", () => {
	it("joins the agent's words, keeps one line per step, and follows a guest's question", () => {
		const blocks = guestBlocks([
			{ n: 1, type: "user", text: "Ship it" },
			{ n: 2, type: "turn_start" },
			{ n: 3, type: "message", text: "On " },
			{ n: 4, type: "message", text: "it." },
			{ n: 5, type: "tool", id: "t1", title: "Run deploy", status: "running" },
			{ n: 6, type: "tool", id: "t1", status: "completed" },
			{ n: 7, type: "message", text: "Shipped." },
			{ n: 8, type: "guest_request", id: "g1", name: "Dana", text: "Friday?" },
			{ n: 9, type: "guest_request_resolved", id: "g1", action: "sent" },
			{ n: 10, type: "user", text: "Friday?", guest: "Dana" },
			{ n: 11, type: "user", text: "Carry on", from: "Claude Desktop, an agent outside Grid" },
		]);
		expect(blocks).toEqual([
			{ kind: "user", key: "1", text: "Ship it", from: "The thread's person" },
			{ kind: "agent", key: "3", text: "On it." },
			{ kind: "step", key: "5", id: "t1", title: "Run deploy", done: true },
			{ kind: "agent", key: "7", text: "Shipped." },
			{ kind: "asked", key: "8", id: "g1", name: "Dana", text: "Friday?", state: "sent" },
			{ kind: "user", key: "11", text: "Carry on", from: "Claude Desktop, an agent outside Grid" },
		]);
	});
});
