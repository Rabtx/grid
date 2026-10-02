import { describe, expect, it } from "vitest";

import { joinNote, noteSummary, parseNote, splitNote, taskCount, toggleTask } from "./note-doc";

const NOTE = [
	"# Dispatch ETA rules",
	"",
	"ETAs must match the app. See `src/jobs/eta.ts` and `@eta.test.ts:12`.",
	"",
	"## Rounding",
	"",
	"- [x] Round to 5 minutes",
	"- [ ] Never show 0 min",
	"  - [x] Nested",
	"",
	"```ts",
	"- [ ] not a task",
	"```",
	"",
	"> - [ ] Quoted",
	"",
	"1. **Bold** [docs](https://grid.dev) [bad](javascript:alert(1))",
].join("\n");

describe("a note's text", () => {
	it("splits into its title and the rest, and keeps a first line that was not changed", () => {
		expect(splitNote(NOTE).title).toBe("Dispatch ETA rules");
		expect(splitNote(NOTE).rest.startsWith("ETAs must match")).toBe(true);
		expect(splitNote("```\ncode\n```").title).toBe("");
		// An agent's answer keeps its first line as written unless the title is renamed.
		expect(joinNote("Use **Hono**\nfor the API", "Use Hono", "for the API, v4")).toBe(
			"Use **Hono**\n\nfor the API, v4",
		);
		expect(joinNote("Use **Hono**\nfor the API", "Hono", "for the API")).toBe(
			"# Hono\n\nfor the API",
		);
		expect(joinNote("", "", "Just words")).toBe("Just words");
	});

	it("reads into blocks: headings, tasks in order, files as mentions, safe links only", () => {
		const blocks = parseNote(splitNote(NOTE).rest);
		expect(blocks.map((block) => block.kind)).toEqual([
			"paragraph",
			"heading",
			"list",
			"code",
			"quote",
			"list",
		]);
		const first = blocks[0];
		expect(first.kind === "paragraph" && first.content).toEqual([
			{ kind: "text", text: "ETAs must match the app. See " },
			{ kind: "file", path: "src/jobs/eta.ts", line: null },
			{ kind: "text", text: " and " },
			{ kind: "file", path: "eta.test.ts", line: 12 },
			{ kind: "text", text: "." },
		]);
		const list = blocks[2];
		const rest = splitNote(NOTE).rest;
		const boxes =
			list.kind === "list"
				? list.items.map((item) => [item.task, rest.slice(item.taskAt, item.taskAt + 3)])
				: [];
		expect(boxes).toEqual([
			[true, "[x]"],
			[false, "[ ]"],
		]);
		expect(list.kind === "list" && list.items[1].children[0]).toMatchObject({
			kind: "list",
			items: [{ task: true }],
		});
		const last = blocks[5];
		expect(last.kind === "list" && last.items[0].content).toEqual([
			{ kind: "strong", children: [{ kind: "text", text: "Bold" }] },
			{ kind: "text", text: " " },
			{ kind: "link", href: "https://grid.dev/", children: [{ kind: "text", text: "docs" }] },
			{ kind: "text", text: " " },
			{ kind: "text", text: "bad" },
		]);
	});

	it("ticks the task whose box was read, never a look-alike in code", () => {
		const rest = splitNote(NOTE).rest;
		const at = (text: string, words: string) => {
			const found = (list: ReturnType<typeof parseNote>): number => {
				for (const block of list) {
					if (block.kind === "list")
						for (const item of block.items) {
							if (JSON.stringify(item.content).includes(words)) return item.taskAt;
							const inner = found(item.children);
							if (inner >= 0) return inner;
						}
					if (block.kind === "quote") {
						const inner = found(block.blocks);
						if (inner >= 0) return inner;
					}
				}
				return -1;
			};
			return found(parseNote(text));
		};
		expect(toggleTask(rest, at(rest, "Never show"), true)).toContain("- [x] Never show 0 min");
		expect(toggleTask(rest, at(rest, "Nested"), false)).toContain("  - [ ] Nested");
		const quoted = toggleTask(rest, at(rest, "Quoted"), true);
		expect(quoted).toContain("> - [x] Quoted");
		expect(quoted).toContain("- [ ] not a task");
		// A task-like line in code inside a list item comes before the real one.
		const tricky = "1. Setup\n\n    ```md\n    - [ ] example in code\n    ```\n\n- [ ] real task";
		const ticked = toggleTask(tricky, at(tricky, "real task"), true);
		expect(ticked).toContain("- [x] real task");
		expect(ticked).toContain("- [ ] example in code");
		// Anything that is not a box is left alone.
		expect(toggleTask(rest, 0, true)).toBe(rest);
		expect(toggleTask(rest, -1, true)).toBe(rest);
	});

	it("sums up for the list: a checklist by its progress, other notes by their words", () => {
		expect(taskCount(NOTE)).toEqual({ done: 2, total: 4 });
		expect(noteSummary("# Release\n\n- [x] Changelog\n- [ ] Tag")).toEqual({
			title: "Release",
			preview: "1 of 2 done",
		});
		expect(noteSummary(NOTE).preview.startsWith("ETAs must match the app.")).toBe(true);
		expect(noteSummary("")).toEqual({ title: "Untitled note", preview: "" });
	});
});
