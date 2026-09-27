import { afterAll, afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ChatEvent } from "./events";
import { exitReason, freebuffProvider } from "./freebuff";
import { exportedTurn } from "./freebuff-export";
import {
	connectionWarning,
	findEcho,
	inSession,
	isMenu,
	isWorking,
	menuNotes,
	mergeScrolled,
	parseMenu,
	parseReply,
	ReplyTracker,
	sessionModel,
} from "./freebuff-screen";
import type { AgentSession } from "./provider";
import { spawnTui } from "./tui";

// Screens as the real CLI draws them (trailing spaces trimmed).
const MENU = `
                 Start coding for free   11 day streak  ●●●●●●●+
                 ┌──────────────────────────────────────────────────────────────────────────┐
                 │   GLM 5.3 Flash · Deep reasoning · Reasoning: max · Images · NEW         │
                 │                              5 Freebucks/hr                              │
                 └──────────────────────────────────────────────────────────────────────────┘
                 ┌──────────────────────────────────────────────────────────────────────────┐
                 │ › DeepSeek V4.1 Flash · Smart & Fast · Reasoning: max* · Images · NEW    │
                 │              15 Freebucks/hr · May use data for AI training              │
                 └──────────────────────────────────────────────────────────────────────────┘
                 ┌──────────────────────────────────────────────────────────────────────────┐
                 │   Solar Mini 4 · Fast and light · NEW                                    │
                 │                              5 Freebucks/hr                              │
                 └──────────────────────────────────────────────────────────────────────────┘
                 STARTER · 80/105 Freebucks daily · resets in 5h 21m · 290 in wallet
                 ↑  Show fewer
                 ✦ Refer friends → earn Freebucks:
                 ⎘ Copy invite link  Open Earn ↵
                 🎁  Streak perk: +15 Freebucks every Pacific day
                                                  H · History
──────────────────────────────────────────────────────────────────────────`.split("\n");

const DONE = `
  Directory /tmp/project

   [06:45 PM]
   Reply with: hello from grid. Then a markdown list of 3 fruits, then one sentence about each. ⎘

  • Thinking
    The user wants a simple reply. No tools needed.

  hello from grid.
  - Apple — a crisp, sweet-tart fruit.
  - Banana — a soft, sweet tropical fruit.
                                                                                                ⎘ • 7s • △▽
 DeepSeek V4.1 Flash · 55m left · 13.9K (1%)                                                   ✕ End session
╭────────────────────────────────────────────────────────────────────────────────────────────────────────────╮
│  ▍Enter a coding task or / for commands                                                                    │
╰────────────────────────────────────────────────────────────────────────────────────────────────────────────╯`.split(
	"\n",
);

const PROMPT =
	"Reply with: hello from grid. Then a markdown list of 3 fruits, then one sentence about each.";

describe("reading Freebuff's screen", () => {
	it("reads the model menu, its highlight and its effort levels", () => {
		const menu = parseMenu(MENU);
		expect(menu.models.map((model) => model.id)).toEqual([
			"GLM 5.3 Flash",
			"DeepSeek V4.1 Flash",
			"Solar Mini 4",
		]);
		expect(menu.selected).toBe(1);
		expect(menu.collapsed).toBe(false);
		expect(menu.models[1].description).toBe(
			"Smart & Fast · 15 Freebucks/hr · May use data for AI training",
		);
		expect(menu.models[1].efforts?.map((effort) => effort.id)).toEqual(["low", "high", "max"]);
		expect(menu.models[1].defaultEffort).toBe("max");
		expect(menu.models[2].efforts).toBeUndefined();
		expect(isMenu(MENU)).toBe(true);
	});

	it("keeps the tool's own lines about the wallet and perks", () => {
		expect(menuNotes(MENU)).toEqual([
			"Start coding for free   11 day streak  ●●●●●●●+",
			"STARTER · 80/105 Freebucks daily · resets in 5h 21m · 290 in wallet",
			"✦ Refer friends → earn Freebucks:",
			"⎘ Copy invite link  Open Earn ↵",
			"🎁  Streak perk: +15 Freebucks every Pacific day",
		]);
	});

	it("reads the session line and whether it is working", () => {
		expect(sessionModel(DONE)).toBe("DeepSeek V4.1 Flash");
		expect(sessionModel([" Solar Mini 4 · 1h left      ✕ End session"])).toBe("Solar Mini 4");
		expect(inSession(DONE)).toBe(true);
		expect(isWorking(DONE)).toBe(false);
		expect(isWorking([" thinking...        1s  ■ Esc"])).toBe(true);
		expect(isMenu(DONE)).toBe(false);
	});

	it("passes on why it cannot connect", () => {
		const lines = [
			"  ⚠ Couldn't get a response from www.codebuff.com. If your browser can open",
			"  freebuff.com, this network isn't routing to that host.",
			"",
			"      H · History",
		];
		expect(connectionWarning(lines)).toBe(
			"Couldn't get a response from www.codebuff.com. If your browser can open freebuff.com, this network isn't routing to that host.",
		);
	});

	it("splits a finished reply into reasoning and text", () => {
		const tracker = new ReplyTracker(PROMPT);
		expect(tracker.update(DONE)).toEqual({
			reasoning: "The user wants a simple reply. No tools needed.",
			text: "hello from grid.\n- Apple — a crisp, sweet-tart fruit.\n- Banana — a soft, sweet tropical fruit.",
		});
		expect(tracker.finished).toBe(true);
	});

	it("finds the echo of a message that wrapped onto several rows", () => {
		const lines = ["   [06:45 PM]", "   a long message that wrapped", "   onto two rows ⎘"];
		expect(findEcho(lines, "a long message that wrapped onto two rows")).toBe(2);
		expect(findEcho(lines, "something else")).toBe(-1);
	});

	it("does not take a copy mark inside a reply for a message", () => {
		const lines = ["   [06:45 PM]", "   run it ⎘", "", "  ```sh", "  bun test ⎘", "  ```"];
		expect(findEcho(lines, "bun test")).toBe(-1);
		expect(parseReply(lines.slice(2)).text).toBe("```sh\nbun test ⎘\n```");
	});

	it("ignores the scrollbar drawn into the last column", () => {
		const reply = parseReply(["  one                █", "  two                █"]);
		expect(reply.text).toBe("one\ntwo");
	});
});

describe("when Freebuff stops", () => {
	it("says why in its own words", () => {
		expect(
			exitReason([
				"",
				"❌ freebuff exited immediately (signal SIGSEGV)",
				"",
				"The binary crashed with an access violation.",
				"System info:",
			]),
		).toBe(
			"Freebuff stopped: freebuff exited immediately (signal SIGSEGV) The binary crashed with an access violation. System info:",
		);
		expect(exitReason([])).toBe("Freebuff stopped");
	});
});

describe("merging rows that scrolled off", () => {
	it("joins at the longest overlap", () => {
		expect(mergeScrolled(["1", "2", "3", "4"], ["3", "4", "5", "6"])).toEqual([
			"1",
			"2",
			"3",
			"4",
			"5",
			"6",
		]);
	});

	it("keeps identical rows instead of collapsing them", () => {
		expect(mergeScrolled(["a", "a", "a", "b"], ["a", "a", "b", "c"])).toEqual([
			"a",
			"a",
			"a",
			"b",
			"c",
		]);
	});

	it("counts a row that was still being written once", () => {
		expect(mergeScrolled(["1", "2", "3 hal"], ["2", "3 half", "4"])).toEqual([
			"1",
			"2",
			"3 half",
			"4",
		]);
	});

	it("without an overlap, takes only what no longer fits as scrolled off", () => {
		expect(mergeScrolled(["1", "2"], ["5", "6"])).toEqual(["5", "6"]);
		expect(mergeScrolled(["1", "2", "3", "4"], ["9"])).toEqual(["1", "2", "3", "9"]);
	});
});

describe("Freebuff's export", () => {
	it("restates the last turn: reasoning, text and tools, in order", () => {
		const events = exportedTurn([
			{ id: "user-1", variant: "user", content: "first" },
			{ id: "ai-1", variant: "ai", blocks: [{ type: "text", content: "old" }] },
			{ id: "user-2", variant: "user", content: "second" },
			{
				id: "ai-2",
				variant: "ai",
				blocks: [
					{ type: "mode-divider", mode: "LITE" },
					{ type: "text", textType: "reasoning", content: "Think." },
					{ type: "tool", toolName: "read_files", input: { paths: ["a.ts"] }, output: "ok" },
					{ type: "text", content: "**Done**" },
					{ type: "text", content: "Also this." },
				],
			},
			{ id: "sys-1", variant: "ai", content: "Exported conversation" },
		]);
		expect(events).toEqual([
			{ type: "reasoning", text: "Think." },
			{
				type: "tool",
				id: "ai-2-2",
				title: "read files",
				kind: "read",
				status: "completed",
				input: '{\n  "paths": [\n    "a.ts"\n  ]\n}',
				output: "ok",
			},
			{ type: "message", text: "**Done**" },
			{ type: "message", text: "\n\nAlso this." },
		]);
	});

	it("gives nothing for something that is not an export", () => {
		expect(exportedTurn({ messages: [] })).toEqual([]);
		expect(exportedTurn(null)).toEqual([]);
	});
});

const FAKE = join(import.meta.dir, "testing", "fake-freebuff-cli.ts");

describe("driving the CLI", () => {
	const folders: string[] = [];
	const sessions: AgentSession[] = [];
	const stateDir = mkdtempSync(join(tmpdir(), "grid-freebuff-state-"));
	afterAll(() => rmSync(stateDir, { recursive: true, force: true }));
	afterEach(() => {
		for (const session of sessions.splice(0)) session.close();
		for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
	});

	function provider(rows = 60, replyLines = 3, extra: Record<string, string> = {}) {
		return freebuffProvider({
			binary: "freebuff",
			available: () => true,
			stateDir,
			spawn: (command, cwd) =>
				spawnTui({
					command: ["bun", FAKE, ...command.slice(1)],
					cwd,
					cols: 120,
					rows,
					name: "Freebuff",
					env: { FAKE_REPLY_LINES: String(replyLines), FAKE_STATE_DIR: stateDir, ...extra },
				}),
		});
	}

	async function start(
		model: string | undefined,
		rows?: number,
		replyLines?: number,
		extra?: Record<string, string>,
		resume?: string,
	) {
		const cwd = mkdtempSync(join(tmpdir(), "grid-freebuff-test-"));
		folders.push(cwd);
		const events: ChatEvent[] = [];
		const tokens: string[] = [];
		const session = await provider(rows, replyLines, extra).start({
			cwd,
			model,
			resume,
			emit: (event) => events.push(event),
			onResumeToken: (token) => tokens.push(token),
		});
		sessions.push(session);
		return { cwd, events, tokens, session };
	}

	it("lists every model from the menu, opening its full list", async () => {
		const models = await provider().catalog?.();
		expect(models?.models.map((model) => model.id)).toEqual([
			"Solar Mini 4",
			"DeepSeek V4.1 Flash",
			"Gemini 3.8 Flash",
		]);
	});

	it("picks the model with keys, streams the reply, then restates it exactly", async () => {
		const { cwd, events, tokens, session } = await start("Gemini 3.8 Flash");
		const result = await session.prompt("Say hello");
		expect(result).toEqual({ reason: "done" });

		const info = events.find((event) => event.type === "info");
		expect(info).toMatchObject({ type: "info", model: "Gemini 3.8 Flash" });
		const notes = events.find((event) => event.type === "tool");
		expect(notes).toMatchObject({ title: "Freebuff session", input: "Gemini 3.8 Flash" });

		const streamed = events
			.filter((event) => event.type === "message")
			.map((event) => (event as { text: string }).text)
			.join("");
		expect(streamed).toContain("row 1\n");
		expect(events.at(-1)).toEqual({
			type: "turn_rewrite",
			events: [
				{ type: "reasoning", text: "Reading the request." },
				{ type: "message", text: "**Exact** reply\n\nrow 1\nrow 2\nrow 3" },
			],
		});
		// The conversation's own id, to pick it up again after the process is closed.
		expect(tokens).toHaveLength(1);
		expect(tokens[0]).toMatch(/^\d{4}-\d\d-\d\dT/);
		// Nothing is written into the project's folder.
		expect(readdirSync(cwd)).toEqual([]);
	}, 20_000);

	it("keeps the whole reply when it scrolls past the top of the screen", async () => {
		const { events, session } = await start(undefined, 14, 40);
		await session.prompt("Count");
		const streamed = events
			.filter((event) => event.type === "message")
			.map((event) => (event as { text: string }).text)
			.join("");
		// Every row streams once and in order, none lost as it scrolls off; the last rows may only
		// come with the restatement, when the chat file says the reply is done first.
		const rows = streamed.split("\n").filter(Boolean);
		expect(rows.length).toBeGreaterThan(30);
		expect(rows).toEqual(Array.from({ length: rows.length }, (_, i) => `row ${i + 1}`));
		const rewrite = events.at(-1) as Extract<ChatEvent, { type: "turn_rewrite" }>;
		expect(rewrite.events.at(-1)).toMatchObject({
			text: expect.stringContaining("row 39\nrow 40"),
		});
	}, 20_000);

	it("waits for the new reply when the same words are sent again", async () => {
		const { events, session } = await start(undefined);
		await session.prompt("hi");
		const before = events.length;
		expect(await session.prompt("hi")).toEqual({ reason: "done" });
		const again = events.slice(before);
		expect(again.at(-1)?.type).toBe("turn_rewrite");
		// Its reply streamed anew: the turn did not end on the first reply.
		expect(again.some((event) => event.type === "message")).toBe(true);
	}, 20_000);

	it("ends the turn from the chat file when the screen cannot be followed", async () => {
		const { events, session } = await start(undefined, 60, 3, { FAKE_NO_ECHO: "1" });
		expect(await session.prompt("Say hello")).toEqual({ reason: "done" });
		expect(events.at(-1)).toEqual({
			type: "turn_rewrite",
			events: [
				{ type: "reasoning", text: "Reading the request." },
				{ type: "message", text: "**Exact** reply\n\nrow 1\nrow 2\nrow 3" },
			],
		});
	}, 20_000);

	it("continues the conversation it was in, by its id", async () => {
		const first = await start(undefined);
		await first.session.prompt("Remember this");
		const id = first.tokens[0];
		first.session.close();
		const commands: string[][] = [];
		const again = await freebuffProvider({
			binary: "freebuff",
			available: () => true,
			stateDir,
			spawn: (command, cwd) => {
				commands.push(command);
				return spawnTui({
					command: ["bun", FAKE, ...command.slice(1)],
					cwd,
					cols: 120,
					rows: 60,
					name: "Freebuff",
					env: { FAKE_STATE_DIR: stateDir },
				});
			},
		}).start({
			cwd: first.cwd,
			resume: id,
			emit: () => undefined,
			onResumeToken: () => undefined,
		});
		sessions.push(again);
		expect(await again.prompt("And now?")).toEqual({ reason: "done" });
		expect(commands[0]).toEqual(["freebuff", "--continue", id]);
	}, 20_000);

	it("sends a message with several lines as one", async () => {
		const { events, session } = await start(undefined);
		await session.prompt("first line\nsecond line");
		expect(events.at(-1)?.type).toBe("turn_rewrite");
	}, 20_000);

	it("switches model by ending the session and choosing again", async () => {
		const { events, session } = await start(undefined);
		await session.prompt("Hi");
		await session.setModel("Solar Mini 4");
		expect(events.at(-1)).toMatchObject({ type: "info", model: "Solar Mini 4" });
	}, 20_000);

	it("stops a turn with Esc", async () => {
		const { session } = await start(undefined, 60, 400);
		const turn = session.prompt("Long one");
		await Bun.sleep(1500);
		session.cancel();
		expect(await turn).toEqual({ reason: "cancelled" });
	}, 20_000);

	it("says when Freebuff does not offer the model", async () => {
		const { session } = await start("Nope 1");
		expect(await session.prompt("Hi")).toMatchObject({
			reason: "error",
			error: "Freebuff does not offer Nope 1 right now",
		});
	}, 20_000);
});
