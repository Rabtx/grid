import { afterAll, afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ChatEvent } from "./events";
import { exitReason, freebuffProvider, ReplyStream } from "./freebuff";
import { exportedTurn } from "./freebuff-export";
import {
	connectionWarning,
	currentModel,
	findEcho,
	inSession,
	isEffortPicker,
	isIdle,
	isMenu,
	isWorking,
	menuNotes,
	mergeScrolled,
	parseEfforts,
	parseMenu,
	parseSegments,
	ReplyTracker,
	sessionModel,
} from "./freebuff-screen";
import type { AgentSession } from "./provider";
import { spawnTui } from "./tui";

// Screens as the real CLI draws them (trailing spaces trimmed).
const MENU = `
 ↑↓ choose model · Tab reasoning · Enter select · Esc cancel
 ┌──────────────────────────────────────────────────────────────────────┐
 │   GLM 5.3 Flash • max        Deep reasoning · Images · NEW           │
 │                            5 Freebucks/hr                            │
 └──────────────────────────────────────────────────────────────────────┘
 ┌──────────────────────────────────────────────────────────────────────┐
 │ › DeepSeek V4.1 Flash • max  Smart & Fast · Images · NEW             │
 │            15 Freebucks/hr · May use data for AI training            │
 └──────────────────────────────────────────────────────────────────────┘
 ┌──────────────────────────────────────────────────────────────────────┐
 │   Solar Mini 4         Fast and light · NEW                          │
 │                            5 Freebucks/hr                            │
 └──────────────────────────────────────────────────────────────────────┘
 STARTER · 45/105 Freebucks daily · resets in 1h 39m · 305 in wallet
 ↑  Show fewer
 DeepSeek V4.1 Flash • max · /home/me/app · /model to change · Chat: New chat
 ← for history · ? for help`.split("\n");

// The picker as newer builds draw it: "Name • level · traits", labels and costs that wrap.
const MENU_NOW = `
 ↑↓ choose model · Tab reasoning · Enter select · Esc cancel
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │   MiMo 2.6 Flash · Balanced · Images                                         │
 │                               10 Freebucks/hr                                │
 └──────────────────────────────────────────────────────────────────────────────┘
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │   Glyph Cluster • high · Stealth preview · New · Experimental                │
 │ 0 Freebucks/hr · Preview model: prompts and outputs may be retained for      │
 │ training                                                                     │
 └──────────────────────────────────────────────────────────────────────────────┘
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │ › Claude Haiku 5.5 • medium · Anthropic · fast · Images · New                │
 │                               30 Freebucks/hr                                │
 │ New: Anthropic's Claude Haiku 5.5, new on Freebuff.                          │
 └──────────────────────────────────────────────────────────────────────────────┘
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │   GPT-6.1 Sol • medium · Promotional · 1 session a day · Images ·            │
 │ Promotional · 1 session a day                                                │
 │                               100 Freebucks/hr                               │
 └──────────────────────────────────────────────────────────────────────────────┘
 STARTER · 75/105 Freebucks daily · resets in 21h 7m · 305 in wallet
 ↑  Show fewer
 Claude Haiku 5.5 • medium · /home/me/app · /model to change · Chat: New chat`.split("\n");

// The screen Freebuff opens on: its notes, the input box, and the model under it.
const START = `
 ┌──────────────────────────────────────────────────────────────────┐
 │ May use data for AI training                                     │
 │ Your first message starts the session.                           │
 │ 45/105 Freebucks remaining                                       │
 │ Starter plan                                                     │
 │ 12 day streak                                                    │
 │ 🎁─ Streak perk: +15 Freebucks every Pacific day                  │
 │ ✦ Refer friends → earn Freebucks:                                │
 └──────────────────────────────────────────────────────────────────┘
╭──────────────────────────────────────────────────────────────────────╮
│  ▍Enter a coding task or / for commands                              │
╰──────────────────────────────────────────────────────────────────────╯
 Solar Mini 4 · /home/me/app · /model to change · Chat: New chat
 ← for history · ? for help`.split("\n");

const EFFORTS = `
  ↑↓ choose · Enter save · Esc back
    low
    high (default)
  › max
 DeepSeek V4.1 Flash • max · /home/me/app · /model to change`.split("\n");

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
 1h left · 13.9K (1%)                                                                          ✕ End session
╭────────────────────────────────────────────────────────────────────────────────────────────────────────────╮
│  ▍Enter a coding task or / for commands                                                                    │
╰────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
 DeepSeek V4.1 Flash • max · /home/me/app · /model to change · Chat: Reply with
 ← for history · ? for help`.split("\n");

// A reply part way through, its rows as the real CLI lays them out at 160 columns.
const WORKING_REPLY = [
	"  • Thinking",
	"    I need to find landing page performance issues and fix them in a new worktree, following the AGENTS.md workflow of claiming a card and working in",
	"    agent/<role>/<card-slug>. Let me check worktrees.md first.",
	"",
	"  I'll start by reading the worktree rules and locating the landing page.",
	"",
	"  • Read .agents/worktrees.md, .agents/README.md",
	"",
	"  • Read apps/web/src/app/page.tsx, apps/web/src/app/landing/page.tsx, apps/web/src/app/landing/layout.tsx, apps/web/src/app/layout.tsx, .agents/board/",
	"  README.md, .wtp.yml",
	"",
	"  • Search blur|filter: in apps/web/src/modules/landing/styles (0 results)",
	"  $ git branch --show-current; which wtp",
	"  main",
	"  /usr/bin/wtp",
	"  Show 3 more lines",
	"",
	"  I've found several likely hotspots: a WebGL shader in multiple cards, filter: blur animations, and an always-on backdrop-blur header. Next I'll read",
	"  the rest.",
	"",
	"  Short lines",
	"  keep their breaks.",
	"",
	"  • Web Search solid 2 docs",
];

const PROMPT =
	"Reply with: hello from grid. Then a markdown list of 3 fruits, then one sentence about each.";

describe("reading Freebuff's screen", () => {
	it("reads the model picker, its highlight and each model's reasoning", () => {
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
		expect(isIdle(MENU)).toBe(false);
	});

	it("reads the picker as newer builds draw it, wrapped rows and all", () => {
		const menu = parseMenu(MENU_NOW);
		expect(menu.models.map((model) => model.id)).toEqual([
			"MiMo 2.6 Flash",
			"Glyph Cluster",
			"Claude Haiku 5.5",
			"GPT-6.1 Sol",
		]);
		expect(menu.selected).toBe(2);
		expect(menu.models[0]).toEqual({
			id: "MiMo 2.6 Flash",
			name: "MiMo 2.6 Flash",
			description: "Balanced · 10 Freebucks/hr",
		});
		expect(menu.models[1].description).toBe(
			"Stealth preview · Experimental · 0 Freebucks/hr · Preview model: prompts and outputs may be retained for training",
		);
		expect(menu.models[2].efforts?.map((effort) => effort.id)).toEqual(["low", "medium", "high"]);
		expect(menu.models[2].defaultEffort).toBe("medium");
		expect(menu.models[3].description).toBe("Promotional · 1 session a day · 100 Freebucks/hr");
		expect(sessionModel(MENU_NOW)).toBe("Claude Haiku 5.5");
	});

	it("reads the reasoning levels inside the picker", () => {
		expect(isEffortPicker(EFFORTS)).toBe(true);
		expect(parseEfforts(EFFORTS)).toEqual({ levels: ["low", "high", "max"], selected: 2 });
	});

	it("keeps the tool's own lines about the wallet and perks", () => {
		expect(menuNotes(START)).toEqual([
			"45/105 Freebucks remaining",
			"Starter plan",
			"12 day streak",
			"🎁─ Streak perk: +15 Freebucks every Pacific day",
			"✦ Refer friends → earn Freebucks:",
		]);
	});

	it("reads the model under the input, and whether it is ready or working", () => {
		expect(currentModel(START)).toEqual({ model: "Solar Mini 4", effort: null });
		expect(currentModel(DONE)).toEqual({ model: "DeepSeek V4.1 Flash", effort: "max" });
		expect(sessionModel(MENU)).toBe("DeepSeek V4.1 Flash");
		// Ready before any session: the first message starts one.
		expect(isIdle(START)).toBe(true);
		expect(inSession(START)).toBe(false);
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
		const tracker = new ReplyTracker(PROMPT, 160);
		expect(tracker.update(DONE)).toEqual([
			{ kind: "reasoning", text: "The user wants a simple reply. No tools needed." },
			{
				kind: "text",
				text: "hello from grid.\n- Apple — a crisp, sweet-tart fruit.\n- Banana — a soft, sweet tropical fruit.",
			},
		]);
		expect(tracker.finished).toBe(true);
	});

	it("reads tools, commands and wrapped rows the way the reply was written", () => {
		expect(parseSegments(WORKING_REPLY, 160)).toEqual([
			{
				kind: "reasoning",
				text: "I need to find landing page performance issues and fix them in a new worktree, following the AGENTS.md workflow of claiming a card and working in agent/<role>/<card-slug>. Let me check worktrees.md first.",
			},
			{
				kind: "text",
				text: "I'll start by reading the worktree rules and locating the landing page.",
			},
			{
				kind: "tool",
				title: "Read",
				tool: "read",
				input: ".agents/worktrees.md, .agents/README.md",
				output: "",
			},
			{
				kind: "tool",
				title: "Read",
				tool: "read",
				input:
					"apps/web/src/app/page.tsx, apps/web/src/app/landing/page.tsx, apps/web/src/app/landing/layout.tsx, apps/web/src/app/layout.tsx, .agents/board/README.md, .wtp.yml",
				output: "",
			},
			{
				kind: "tool",
				title: "Search",
				tool: "search",
				input: "blur|filter: in apps/web/src/modules/landing/styles (0 results)",
				output: "",
			},
			{
				kind: "tool",
				title: "Run",
				tool: "execute",
				input: "git branch --show-current; which wtp",
				output: "main\n/usr/bin/wtp",
			},
			{
				kind: "text",
				text: "I've found several likely hotspots: a WebGL shader in multiple cards, filter: blur animations, and an always-on backdrop-blur header. Next I'll read the rest.\n\nShort lines\nkeep their breaks.",
			},
			{ kind: "tool", title: "Web Search", tool: "fetch", input: "solid 2 docs", output: "" },
		]);
	});

	it("finds the echo of a message that wrapped onto several rows", () => {
		const lines = ["   [06:45 PM]", "   a long message that wrapped", "   onto two rows ⎘"];
		expect(findEcho(lines, "a long message that wrapped onto two rows")).toBe(2);
		expect(findEcho(lines, "something else")).toBe(-1);
	});

	it("does not take a copy mark inside a reply for a message", () => {
		const lines = ["   [06:45 PM]", "   run it ⎘", "", "  ```sh", "  bun test ⎘", "  ```"];
		expect(findEcho(lines, "bun test")).toBe(-1);
		expect(parseSegments(lines.slice(2), 160)).toEqual([
			{ kind: "text", text: "```sh\nbun test ⎘\n```" },
		]);
	});

	it("ignores the scrollbar drawn into the last column", () => {
		expect(parseSegments(["  one                █", "  two                █"], 160)).toEqual([
			{ kind: "text", text: "one\ntwo" },
		]);
	});
});

describe("streaming what the screen shows", () => {
	const notes = { type: "tool", id: "notes", title: "Freebuff session" } as const;

	function stream() {
		const events: ChatEvent[] = [];
		let clock = 0;
		const replies = new ReplyStream(
			(event) => events.push(event),
			[notes],
			() => clock,
		);
		return { events, replies, tick: (ms: number) => (clock += ms) };
	}

	it("sends text as it grows and tools as they appear, settling each tool when the next part comes", () => {
		const { events, replies } = stream();
		replies.show([{ kind: "text", text: "I'll read" }], false);
		replies.show([{ kind: "text", text: "I'll read it." }], false);
		replies.show(
			[
				{ kind: "text", text: "I'll read it." },
				{ kind: "tool", title: "Read", tool: "read", input: "a.ts", output: "" },
			],
			false,
		);
		replies.show(
			[
				{ kind: "text", text: "I'll read it." },
				{ kind: "tool", title: "Read", tool: "read", input: "a.ts", output: "" },
				{ kind: "text", text: "Done" },
			],
			true,
		);
		expect(
			events.map((event) => [
				event.type,
				"text" in event ? event.text : event.type === "tool" ? event.status : null,
			]),
		).toEqual([
			["message", "I'll read"],
			["message", " it."],
			["tool", "running"],
			["tool", "completed"],
			["message", "Done"],
		]);
		const [, , running, settled] = events as Extract<ChatEvent, { type: "tool" }>[];
		expect(settled.id).toBe(running.id);
	});

	it("restates the turn when the screen is redrawn, no more often than every two seconds", () => {
		const { events, replies, tick } = stream();
		replies.show([{ kind: "text", text: "one two" }], false);
		// Laid out again: what was sent is no longer the start of what is shown.
		replies.show([{ kind: "text", text: "One, two" }], false);
		expect(events.at(-1)).toEqual({
			type: "turn_rewrite",
			replaceTools: true,
			events: [notes, { type: "message", text: "One, two" }],
		});
		const before = events.length;
		replies.show([{ kind: "reasoning", text: "Hm" }], false);
		expect(events).toHaveLength(before);
		tick(2_000);
		replies.flush();
		expect(events.at(-1)).toMatchObject({
			type: "turn_rewrite",
			events: [notes, { type: "reasoning", text: "Hm" }],
		});
	});

	it("ends the turn with its exact events when there are some, else with the screen's", () => {
		const exact = stream();
		exact.replies.show([{ kind: "text", text: "rough" }], false);
		exact.replies.finish([{ type: "message", text: "**exact**" }], null);
		expect(exact.events.at(-1)).toEqual({
			type: "turn_rewrite",
			replaceTools: true,
			events: [notes, { type: "message", text: "**exact**" }],
		});
		const screen = stream();
		screen.replies.finish(null, [{ kind: "text", text: "as shown" }]);
		expect(screen.events.at(-1)).toMatchObject({
			events: [notes, { type: "message", text: "as shown" }],
		});
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

/** The turn's restatement (the model that answered is announced after it). */
function rewriteOf(events: ChatEvent[]): ChatEvent | undefined {
	return events.findLast((event) => event.type === "turn_rewrite");
}

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
		// The tool on screen streams as a tool, not as text.
		expect(streamed).not.toContain("Read");
		expect(events).toContainEqual(
			expect.objectContaining({ type: "tool", title: "Read", kind: "read", input: "a.ts, b.ts" }),
		);
		expect(rewriteOf(events)).toEqual({
			type: "turn_rewrite",
			replaceTools: true,
			events: [
				// The session's notes come first again: the restated turn replaces its tools.
				expect.objectContaining({ type: "tool", title: "Freebuff session" }),
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
		const { events, session } = await start(undefined, 18, 40);
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
		const rewrite = rewriteOf(events) as Extract<ChatEvent, { type: "turn_rewrite" }>;
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
		expect(rewriteOf(again)?.type).toBe("turn_rewrite");
		// Its reply streamed anew: the turn did not end on the first reply.
		expect(again.some((event) => event.type === "message")).toBe(true);
	}, 20_000);

	it("ends the turn from the chat file when the screen cannot be followed", async () => {
		const { events, session } = await start(undefined, 60, 3, { FAKE_NO_ECHO: "1" });
		expect(await session.prompt("Say hello")).toEqual({ reason: "done" });
		expect(rewriteOf(events)).toEqual({
			type: "turn_rewrite",
			replaceTools: true,
			events: [
				// The session's notes come first again: the restated turn replaces its tools.
				expect.objectContaining({ type: "tool", title: "Freebuff session" }),
				{ type: "reasoning", text: "Reading the request." },
				{ type: "message", text: "**Exact** reply\n\nrow 1\nrow 2\nrow 3" },
			],
		});
	}, 20_000);

	it("ends the turn from the screen when the chat file never says complete", async () => {
		const { events, session } = await start(undefined, 60, 3, { FAKE_NO_COMPLETE: "1" });
		expect(await session.prompt("Say hello")).toEqual({ reason: "done" });
		// The exact text still comes from the file.
		expect(events.find((event) => event.type === "turn_rewrite")).toMatchObject({
			events: [
				{ type: "tool", title: "Freebuff session" },
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
		expect(rewriteOf(events)?.type).toBe("turn_rewrite");
	}, 20_000);

	it("switches model mid-chat in Freebuff's own picker", async () => {
		const { events, session } = await start(undefined);
		await session.prompt("Hi");
		await session.setModel("Solar Mini 4");
		expect(events.at(-1)).toMatchObject({ type: "info", model: "Solar Mini 4" });
		expect(await session.prompt("Still there?")).toEqual({ reason: "done" });
	}, 20_000);

	it("sets the reasoning level with Tab in the picker", async () => {
		const { events, session } = await start("Gemini 3.8 Flash");
		await session.prompt("Hi");
		await session.setEffort("low");
		expect(events.at(-1)).toMatchObject({
			type: "info",
			model: "Gemini 3.8 Flash",
			effort: "low",
		});
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
