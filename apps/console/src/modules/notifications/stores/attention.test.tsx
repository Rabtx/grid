import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attentionService, type Waiting } from "../services/attention.service";
import { attentionStore } from "./attention";

vi.mock("@/modules/environments", () => ({ placementsStore: { scopes: () => [""] } }));
vi.mock("@/modules/inbox", () => ({
	inboxStore: {
		loaded: () => false,
		items: () => [],
		error: () => null,
		load: vi.fn(async () => {}),
	},
}));
vi.mock("../services/attention.service", () => ({
	attentionService: { waiting: vi.fn(), approve: vi.fn(async () => {}) },
}));
const item: Waiting = {
	sessionId: "s1",
	project: "grid",
	thread: "Work",
	provider: "claude",
	approval: {
		id: "a1",
		title: "Run tests",
		detail: null,
		options: [{ id: "yes", label: "Allow", kind: "allow" }],
	},
};
async function settle() {
	for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe("attention polling lifecycle", () => {
	let stop = () => {};
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		vi.mocked(attentionService.waiting).mockResolvedValue([item]);
	});
	afterEach(() => {
		stop();
		vi.useRealTimers();
	});
	it("does not restore an old account's pending request after disposal", async () => {
		let finish!: (value: Waiting[]) => void;
		vi.mocked(attentionService.waiting).mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		stop = attentionStore.start("old-token");
		stop();
		finish([item]);
		await settle();
		expect(attentionStore.waiting()).toEqual([]);
		stop = attentionStore.start("new-token");
		await settle();
		expect(attentionStore.waiting()).toHaveLength(1);
	});
	it("does not restore an answered request from a stale poll", async () => {
		stop = attentionStore.start("token");
		await settle();
		let finish!: (value: Waiting[]) => void;
		vi.mocked(attentionService.waiting).mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		await vi.advanceTimersByTimeAsync(4_000);
		await attentionStore.answer("token", attentionStore.waiting()[0]!, "yes");
		finish([item]);
		await settle();
		expect(attentionStore.waiting()).toEqual([]);
	});
});
