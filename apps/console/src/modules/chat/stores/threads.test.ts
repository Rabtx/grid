import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatSession } from "../types/chat.types";

const sessionsPage = vi.fn();
vi.mock("../services/chat.service", () => ({
	chatService: { sessionsPage: (...args: unknown[]) => sessionsPage(...args) },
}));
vi.mock("@/lib/local-store", () => ({
	localStore: {
		get: async () => null,
		set: async () => {},
		version: () => 0,
		onUserChange: () => () => {},
	},
}));
vi.mock("@/modules/environments", () => ({ placementsStore: { scopeOf: () => "" } }));
const { threadsStore } = await import("./threads");
const thread = (id: string, project: string): ChatSession => ({
	id,
	project,
	provider: "codex",
	title: id,
	cwd: "/tmp/project",
	createdAt: "2026-10-06T00:00:00Z",
	updatedAt: "2026-10-06T00:00:00Z",
	model: null,
	effort: null,
	mode: null,
});
const page = (ids: string[], project: string, nextCursor: string | null, total: number) => ({
	sessions: ids.map((id) => thread(id, project)),
	nextCursor,
	total,
});
afterEach(() => sessionsPage.mockReset());
describe("thread refresh ordering", () => {
	it("keeps the newest reload when earlier reads finish later", async () => {
		let old!: (value: ReturnType<typeof page>) => void;
		sessionsPage
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						old = resolve;
					}),
			)
			.mockResolvedValueOnce(page(["new"], "refresh-race", null, 1));
		const first = threadsStore.load("token", "refresh-race");
		await threadsStore.reload("token", "refresh-race");
		old(page(["old"], "refresh-race", null, 1));
		await first;
		expect(threadsStore.threads("refresh-race").map((item) => item.id)).toEqual(["new"]);
	});
});

describe("thread pages", () => {
	it("reads a page at a time and appends the next one", async () => {
		sessionsPage
			.mockResolvedValueOnce(page(["a", "b"], "paged", "cursor-1", 3))
			.mockResolvedValueOnce(page(["c"], "paged", null, 3));
		await threadsStore.load("token", "paged");
		expect(threadsStore.threads("paged").map((item) => item.id)).toEqual(["a", "b"]);
		expect(threadsStore.total("paged")).toBe(3);
		expect(threadsStore.hasMore("paged")).toBe(true);

		await threadsStore.loadMore("token", "paged");
		expect(threadsStore.threads("paged").map((item) => item.id)).toEqual(["a", "b", "c"]);
		expect(threadsStore.total("paged")).toBe(3);
		expect(threadsStore.hasMore("paged")).toBe(false);
	});

	it("does nothing when there is no next page", async () => {
		sessionsPage.mockResolvedValueOnce(page(["only"], "single", null, 1));
		await threadsStore.load("token", "single");
		await threadsStore.loadMore("token", "single");
		expect(sessionsPage).toHaveBeenCalledTimes(1);
	});
});
