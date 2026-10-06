import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Note } from "../types/project.types";

const list = vi.fn<() => Promise<Note[]>>();
const update = vi.fn();
const create = vi.fn();
const get = vi.fn();
vi.mock("../services/projects.service", () => ({
	projectsService: {
		listNotes: () => list(),
		updateNote: (...args: unknown[]) => update(...args),
		createNote: (...args: unknown[]) => create(...args),
	},
}));
vi.mock("@/lib/local-store", () => ({
	localStore: {
		get: () => get(),
		set: async () => {},
		version: () => 0,
		onUserChange: () => () => {},
	},
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
		create.mockReset();
		get.mockReset().mockResolvedValue(null);
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
	it("does not let a read started before a successful creation hide the new note", async () => {
		let finish!: (value: Note[]) => void;
		list.mockImplementation(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		const reading = notesStore.load("token", "creation-race");
		await Promise.resolve();
		const added = note("n4", "# Added");
		create.mockResolvedValue(added);
		await notesStore.add("token", "creation-race", { body: added.body });
		finish([note("n1", "# Old")]);
		await reading;
		expect(notesStore.notes("creation-race").map((item) => item.id)).toContain("n4");
	});

	it("does not let delayed cache hydration erase a note created while opening", async () => {
		let hydrate!: (value: Note[]) => void;
		get.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					hydrate = resolve;
				}),
		);
		list.mockResolvedValue([]);
		const reading = notesStore.load("token", "hydration-race");
		const added = note("n4", "# Added while opening");
		create.mockResolvedValue(added);
		await notesStore.add("token", "hydration-race", { body: added.body });
		hydrate([]);
		await reading;
		expect(notesStore.notes("hydration-race").map((item) => item.id)).toEqual(["n4"]);
	});
});
