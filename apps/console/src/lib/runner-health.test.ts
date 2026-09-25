import { describe, expect, it, vi } from "vitest";

import {
	checkRunnerHealth,
	onRunnerRecovered,
	reportRunnerFailure,
	runnerRestarted,
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
		expect(runnerRestarted()).toBe(false);
	});

	it("detects restart when startedAt changes", async () => {
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

		expect(runnerRestarted()).toBe(true);
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
