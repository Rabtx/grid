import { describe, expect, it, vi } from "vitest";

import {
	checkRunnerHealth,
	onRunnerRecovered,
	reportRunnerFailure,
	runnerStartedAt,
	runnerUp,
} from "./runner-health";

describe("runner-health", () => {
	it("updates state on successful health response", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ ok: true, startedAt: 1000 }),
		} as Response);

		const result = await checkRunnerHealth(mockFetch);
		expect(result).toBe(true);
		expect(runnerUp()).toBe(true);
		expect(runnerStartedAt()).toBe(1000);
	});

	// The conversation reads this to notice the runner it was following is a new process, so a
	// change here is the only signal a restarted runner gives.
	it("reports a new startedAt when the runner comes back as a new process", async () => {
		const mockFetch1 = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ ok: true, startedAt: 1000 }),
		} as Response);
		await checkRunnerHealth(mockFetch1);

		const mockFetch2 = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ ok: true, startedAt: 2000 }),
		} as Response);
		await checkRunnerHealth(mockFetch2);

		expect(runnerStartedAt()).toBe(2000);
	});

	it("notifies recovery listeners when transitioning from down to up", async () => {
		const recovered = vi.fn();
		const cleanup = onRunnerRecovered(recovered);

		reportRunnerFailure();
		expect(runnerUp()).toBe(false);

		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ ok: true, startedAt: 2000 }),
		} as Response);

		await checkRunnerHealth(mockFetch);
		expect(runnerUp()).toBe(true);
		expect(recovered).toHaveBeenCalled();

		cleanup();
	});
});
