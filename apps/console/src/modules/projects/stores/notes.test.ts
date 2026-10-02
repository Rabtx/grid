import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Note } from "../types/project.types";

const list = vi.fn<() => Promise<Note[]>>();
const update = vi.fn();
vi.mock("../services/projects.service", () => ({
	projectsService: {
		listNotes: () => list(),
		updateNote: (...args: unknown[]) => update(...args),
	},
}));
vi.mock("@/lib/local-store", () => ({
	localStore: { get: async () => null, set: async () => {} },
}));

const { notesStore } = await import("./notes");

const note = (id: string, body: string, flags: Partial<Note> = {}): Note => ({
	id,
	body,
	source: null,
	threadId: null,
	pinned: false,
	shared: false,
	icon: null,
	agents: null,
	author: null,
	editor: null,
	createdAt: "2026-09-24T00:00:00.000Z",
	updatedAt: `2026-09-2${id.slice(1)}T00:00:00.000Z`,
	...flags,
});

describe("the notes store", () => {
	beforeEach(() => {
		list.mockReset();
		update.mockReset();
	});

	it("gives a new thread the shared notes, pinned first, and nothing when none are shared", async () => {
		list.mockResolvedValue([
			note("n1", "# Plain"),
			note("n2", "# Rules", { shared: true }),
			note("n3", "# Brief", { shared: true, pinned: true }),
		]);
		expect(await notesStore.sharedText("token", "alpha")).toBe(
			"## Brief\nnote id: n3\n\n---\n\n## Rules\nnote id: n2",
		);
		list.mockResolvedValue([note("n1", "# Plain")]);
		await notesStore.load("token", "beta");
		expect(await notesStore.sharedText("token", "beta")).toBeUndefined();
	});

	it("gives a thread only the shared notes meant for its agent, each with its id", async () => {
		list.mockResolvedValue([
			note("n1", "# Everyone\n\nRound to 5.", { shared: true }),
			note("n2", "# Codex only", { shared: true, agents: ["codex"] }),
			note("n3", "# Claude only", { shared: true, agents: ["claude"] }),
		]);
		await notesStore.load("token", "delta");
		const forClaude = await notesStore.sharedText("token", "delta", "claude");
		expect(forClaude).toContain("## Everyone\nnote id: n1\n\nRound to 5.");
		expect(forClaude).toContain("## Claude only");
		expect(forClaude).not.toContain("Codex only");
	});

	it("shows a pin at once and puts it back when the API refuses", async () => {
		list.mockResolvedValue([note("n1", "# Plain")]);
		await notesStore.load("token", "gamma");
		let refuse: (cause: Error) => void = () => {};
		update.mockReturnValue(new Promise((_, reject) => (refuse = reject)));
		const pinning = notesStore.update("token", "gamma", "n1", { pinned: true });
		await Promise.resolve();
		expect(notesStore.notes("gamma")[0]?.pinned).toBe(true);
		refuse(new Error("No"));
		await expect(pinning).rejects.toThrow("No");
		expect(notesStore.notes("gamma")[0]?.pinned).toBe(false);
	});
});
