import { describe, expect, it } from "bun:test";

import type { DiagnosticInput } from "./journal";
import { RefusalTally } from "./refusals";

const refusal = {
	kind: "error" as const,
	source: "auth",
	label: "Sign-in refused",
	details: { route: "chat", status: 401 },
};

describe("RefusalTally", () => {
	it("writes the first refusal at once and the rest as one summary a minute", () => {
		let now = 0;
		const rows: DiagnosticInput[] = [];
		const tally = new RefusalTally(
			(entry) => rows.push(entry),
			() => now,
		);
		for (let index = 0; index < 1_000; index++) tally.note("auth:chat:401", refusal);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ workspace: null, details: { count: 1 } });

		now = 30_000;
		tally.flush();
		expect(rows).toHaveLength(1);

		now = 60_000;
		tally.flush();
		expect(rows).toHaveLength(2);
		expect(rows[1]?.message).toBe("Sign-in refused (999 in the last minute)");

		// A quiet minute forgets the kind; the next refusal is written at once again.
		now = 120_000;
		tally.flush();
		tally.note("auth:chat:401", refusal);
		expect(rows).toHaveLength(3);
	});

	it("keeps a bounded number of kinds", () => {
		const rows: DiagnosticInput[] = [];
		const tally = new RefusalTally(
			(entry) => rows.push(entry),
			() => 0,
		);
		for (let index = 0; index < 500; index++) tally.note(`key-${index}`, refusal);
		expect(rows.length).toBeLessThanOrEqual(65);
	});
});
