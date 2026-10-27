import { describe, expect, it } from "bun:test";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { RateLog } from "./rate-log";

describe("rate log", () => {
	it("counts within a window, per scope and key", () => {
		const rates = new RateLog(":memory:");
		expect(rates.take("guest", "a", 2, 60_000, 1_000)).toBe(true);
		expect(rates.take("guest", "a", 2, 60_000, 2_000)).toBe(true);
		expect(rates.take("guest", "a", 2, 60_000, 3_000)).toBe(false);
		expect(rates.take("guest", "b", 2, 60_000, 3_000)).toBe(true);
		expect(rates.take("webhook", "a", 2, 60_000, 3_000)).toBe(true);
		// The first falls out of the window.
		expect(rates.take("guest", "a", 2, 60_000, 61_000)).toBe(true);
		rates.forget("guest", "a");
		expect(rates.take("guest", "a", 1, 60_000, 61_500)).toBe(true);
	});
	it("holds across a restart", () => {
		const path = join(tmpdir(), `grid-rates-${crypto.randomUUID()}.db`);
		const first = new RateLog(path);
		expect(first.take("webhook", "x", 1, 60_000, 1_000)).toBe(true);
		first.close();
		const again = new RateLog(path);
		expect(again.take("webhook", "x", 1, 60_000, 2_000)).toBe(false);
		again.close();
		rmSync(path, { force: true });
	});
});
