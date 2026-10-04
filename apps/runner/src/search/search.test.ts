import { afterAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Provider } from "../agents/provider";
import { ChatHub } from "../chat/hub";
import { ChatStore } from "../chat/store";
import type { Gh } from "../github/gh";
import { askPrompt, askWords, parseAnswer, type Source } from "./ask";
import { matchFiles } from "./files";
import { Search } from "./service";

const dir = mkdtempSync(join(tmpdir(), "grid-search-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const noGh: Gh = {
	run: async () => ({ code: 1, stdout: "", stderr: "no" }),
	spawn: () => {
		throw new Error("not used");
	},
};

describe("files", () => {
	it("finds files whose path holds every word, names first and shorter first", () => {
		const files = [
			"src/jobs/eta.ts",
			"src/jobs/eta.test.ts",
			"docs/beta-notes.md",
			"src/eta/index.ts",
		];
		expect(matchFiles(files, ["eta"])).toEqual([
			"src/jobs/eta.ts",
			"src/jobs/eta.test.ts",
			"docs/beta-notes.md",
			"src/eta/index.ts",
		]);
		expect(matchFiles(files, ["eta", "test"])).toEqual(["src/jobs/eta.test.ts"]);
	});
});

describe("ask", () => {
	const sources: Source[] = [
		{
			n: 1,
			kind: "note",
			title: "Architecture decisions",
			meta: "Note",
			href: "/notes/grid/1",
			text: "Postgres LISTEN for the queue",
		},
		{
			n: 2,
			kind: "commit",
			title: "a12f9e0 · move job queue",
			meta: "Commit",
			href: null,
			text: "move job queue",
		},
	];

	it("keeps a question's words worth searching for", () => {
		expect(askWords("Why did we pick Postgres LISTEN for the queue?")).toEqual([
			"pick",
			"postgres",
			"listen",
			"queue",
		]);
	});

	it("asks for an answer from the sources alone, with numbered citations", () => {
		const prompt = askPrompt("Why LISTEN?", sources, [{ question: "Before?", answer: "Earlier." }]);
		expect(prompt).toContain("[1] Architecture decisions (Note)");
		expect(prompt).toContain("Do not use tools");
		expect(prompt).toContain("Q: Before?");
	});

	it("reads the answer, keeping only citations to real sources", () => {
		const parsed = parseAnswer(
			'```json\n{"answer":"Because it stays in Postgres [1][3].","cited":[1,3],"followUps":["What about Redis?",""]}\n```',
			sources,
		);
		expect(parsed).toEqual({
			answer: "Because it stays in Postgres [1][3].",
			cited: [1],
			followUps: ["What about Redis?"],
		});
		// Not the JSON asked for: the text is the answer, its [n] the citations.
		expect(parseAnswer("It stays in Postgres [2].", sources).cited).toEqual([2]);
	});
});

describe("Search", () => {
	function hub(answer: string) {
		let asked = "";
		const provider: Provider = {
			info: () => ({ id: "claude", name: "Claude Code", available: true, models: [], modes: [] }),
			start: async (context) => ({
				prompt: async (text) => {
					asked = text;
					context.emit({ type: "message", text: answer });
					return { reason: "done" };
				},
				cancel: () => {},
				approve: () => {},
				setModel: async () => {},
				setMode: async () => {},
				setEffort: async () => {},
				close: () => {},
			}),
		};
		const projects = join(dir, "projects");
		mkdirSync(join(projects, "grid"), { recursive: true });
		const store = new ChatStore(":memory:");
		const chat = new ChatHub(store, new Map([["claude", provider]]), projects);
		chat.linkProjectFolder("w", "grid", join(projects, "grid"));
		return { chat, store, asked: () => asked };
	}

	it("finds threads by what was said in them", async () => {
		const { chat } = hub("");
		const thread = chat.create(
			{ userId: "u1", workspace: "w" },
			{ project: "grid", provider: "claude", cwd: join(dir, "projects", "grid") },
		);
		await chat.prompt("w", thread.id, "Round job ETAs to the nearest 5 minutes");
		const search = new Search({
			chat,
			gh: noGh,
			apiSearch: async () => ({ tasks: [], notes: [] }),
		});
		const found = await search.search(
			{ userId: "u1", workspace: "w" },
			{ query: "eta", project: null },
		);
		expect(found.threads.map((item) => item.id)).toEqual([thread.id]);
		expect(found.threads[0]?.passage).toContain("Round job ETAs");
		expect(
			(await search.search({ userId: "u1", workspace: "other" }, { query: "eta", project: null }))
				.threads,
		).toEqual([]);
	});

	it("answers from the notes it finds, without a thread, citing them", async () => {
		const { chat, store, asked } = hub(
			'```json\n{"answer":"It keeps jobs in the database [1].","cited":[1],"followUps":["What would Redis take?"]}\n```',
		);
		const before = store.list("w", "grid").length;
		const search = new Search({
			chat,
			gh: noGh,
			apiSearch: async (auth, query) => {
				expect(auth).toEqual({ token: "t", workspace: "rabtx" });
				expect(query).toContain("postgres");
				return {
					tasks: [],
					notes: [
						{
							project: "grid",
							projectName: "Grid",
							id: "n1",
							title: "Architecture decisions",
							passage: "We picked Postgres LISTEN so jobs stay in the database.",
							updatedAt: "2026-08-12T00:00:00Z",
						},
					],
				};
			},
		});
		const answer = await search.ask(
			{ userId: "u1", workspace: "w" },
			{ token: "t", workspace: "rabtx" },
			{ question: "Why did we pick Postgres LISTEN for the queue?", project: null, history: [] },
		);
		expect(answer.answer).toBe("It keeps jobs in the database [1].");
		expect(answer.sources[0]).toMatchObject({ n: 1, kind: "note", href: "/notes/grid/n1" });
		expect(answer.followUps).toEqual(["What would Redis take?"]);
		expect(asked()).toContain("We picked Postgres LISTEN");
		// Answered once, outside any thread.
		expect(store.list("w", "grid").length).toBe(before);
	});

	it("says so when nothing it can see answers it, without asking an agent", async () => {
		const { chat, asked } = hub("never");
		const search = new Search({
			chat,
			gh: noGh,
			apiSearch: async () => ({ tasks: [], notes: [] }),
		});
		const answer = await search.ask(
			{ userId: "u1", workspace: "w" },
			{ token: "t", workspace: "rabtx" },
			{ question: "Who painted the moon?", project: null, history: [] },
		);
		expect(answer.answer).toContain("found nothing");
		expect(asked()).toBe("");
	});
});
