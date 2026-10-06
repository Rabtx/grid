import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatSession } from "../types/chat.types";

const sessions = vi.fn();
vi.mock("../services/chat.service", () => ({
	chatService: { sessions: (...args: unknown[]) => sessions(...args) },
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
afterEach(() => sessions.mockReset());
describe("thread refresh ordering", () => {
	it("keeps the newest reload when earlier reads finish later", async () => {
		let old!: (value: ChatSession[]) => void;
		sessions
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						old = resolve;
					}),
			)
			.mockResolvedValueOnce([thread("new", "refresh-race")]);
		const first = threadsStore.load("token", "refresh-race");
		await threadsStore.reload("token", "refresh-race");
		old([thread("old", "refresh-race")]);
		await first;
		expect(threadsStore.threads("refresh-race").map((item) => item.id)).toEqual(["new"]);
	});
});
