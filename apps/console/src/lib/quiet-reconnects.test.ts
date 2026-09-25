import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { quietReconnects } from "./quiet-reconnects";

describe("quietReconnects", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("never shows a reconnect that finishes within the quiet period", () => {
		const seen: string[] = [];
		const link = quietReconnects<string>((state) => seen.push(state), 2_000);
		link.set("open");
		link.set("reconnecting");
		vi.advanceTimersByTime(500);
		link.set("open");
		vi.advanceTimersByTime(5_000);
		expect(seen).toEqual(["open", "open"]);
	});

	it("shows a reconnect that outlasts the quiet period, once", () => {
		const seen: string[] = [];
		const link = quietReconnects<string>((state) => seen.push(state), 2_000);
		link.set("open");
		link.set("reconnecting");
		vi.advanceTimersByTime(1_000);
		link.set("reconnecting");
		vi.advanceTimersByTime(1_000);
		expect(seen).toEqual(["open", "reconnecting"]);
	});

	it("passes every other state through at once", () => {
		const seen: string[] = [];
		const link = quietReconnects<string>((state) => seen.push(state), 2_000);
		link.set("reconnecting");
		link.set("gone");
		vi.advanceTimersByTime(5_000);
		expect(seen).toEqual(["gone"]);
	});
});
