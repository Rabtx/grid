import { describe, expect, it } from "bun:test";

import { stallDetector } from "./stall";

describe("stallDetector", () => {
	it("reports a tick more than a second late, once per quiet period", () => {
		let now = 0;
		const stalls: number[] = [];
		const tick = stallDetector(
			(lagMs) => stalls.push(lagMs),
			() => now,
		);

		now = 500;
		tick();
		now = 1_100;
		tick();
		expect(stalls).toEqual([]);

		now = 3_100;
		tick();
		expect(stalls).toEqual([1_500]);

		// Another stall straight after is not written again.
		now = 5_600;
		tick();
		expect(stalls).toEqual([1_500]);

		now = 70_000;
		tick();
		expect(stalls).toHaveLength(2);
	});
});
