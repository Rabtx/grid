import { describe, expect, it } from "bun:test";

import { DiagnosticJournal } from "./journal";

const DAY = 24 * 60 * 60 * 1000;

describe("DiagnosticJournal", () => {
	it("lists workspace and global events newest first and counts recent reconnects", () => {
		let now = 10 * DAY;
		const journal = new DiagnosticJournal(":memory:", () => now);
		journal.record({
			workspace: "alpha",
			kind: "client",
			source: "chat",
			message: "Client started a reconnect",
			details: { event: "reconnect" },
		});
		now += 10;
		journal.record({
			workspace: "beta",
			kind: "client",
			source: "terminal",
			message: "Client started a reconnect",
			details: { event: "reconnect" },
		});
		journal.record({
			workspace: null,
			kind: "error",
			source: "process",
			message: "Runner uncaught",
			details: { errorName: "Error" },
		});

		expect(journal.list("alpha", { since: 0 }).map((event) => event.workspace)).toEqual([
			null,
			"alpha",
		]);
		expect(journal.list("alpha", { since: 0, kind: "connection" })).toEqual([]);
		expect(journal.reconnectCount("alpha", now - DAY)).toBe(1);
		expect(journal.reconnectCount("beta", now - DAY)).toBe(1);
		expect(journal.reconnectCount("alpha", now - 5)).toBe(0);
		journal.close();
	});

	it("trims entries older than seven days and keeps at most 5,000 rows", () => {
		let now = 10 * DAY;
		const journal = new DiagnosticJournal(":memory:", () => now);
		journal.record({
			workspace: "alpha",
			kind: "error",
			source: "process",
			message: "Old event",
			at: now - 8 * DAY,
		});
		journal.record({
			workspace: "alpha",
			kind: "error",
			source: "process",
			message: "Kept event",
		});
		expect(journal.list("alpha", { since: 0 })).toHaveLength(1);

		for (let index = 0; index < 5_001; index++) {
			journal.record({
				workspace: "alpha",
				kind: "connection",
				source: "websocket",
				message: `Close ${index}`,
				at: now + index + 1,
			});
		}
		expect(journal.list("alpha", { since: 0, limit: 5_000 })).toHaveLength(5_000);
		journal.close();
	});
});
