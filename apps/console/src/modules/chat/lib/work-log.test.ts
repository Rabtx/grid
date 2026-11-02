import { describe, expect, it } from "vitest";

import { liveWorkLabel, summarizeWork, thoughtLine, workKind, workLabel } from "./work-log";

type Tool = Parameters<typeof summarizeWork>[0][number];

const read = (path: string): Tool => ({
	tool: "read",
	title: `Read ${path}`,
	input: JSON.stringify({ file_path: path }),
	status: "completed",
});
const run = (command: string, status: Tool["status"] = "completed"): Tool => ({
	tool: "execute",
	title: command,
	status,
});
const edit = (path: string): Tool => ({
	tool: "edit",
	title: `Edit ${path}`,
	status: "completed",
	diffs: [{ path, added: 1, removed: 1 } as NonNullable<Tool["diffs"]>[number]],
});

describe("summarizeWork", () => {
	it("says a run of one kind as a count", () => {
		expect(summarizeWork([read("a.ts"), read("b.ts"), read("c.ts")]).summary).toBe("Read 3 files");
	});

	it("joins two kinds in the order they happened", () => {
		expect(summarizeWork([read("a.ts"), run("bun test"), run("bun lint")]).summary).toBe(
			"Read 1 file and ran 2 commands",
		);
	});

	it("leads with what changed things and counts the rest", () => {
		const tools: Tool[] = [
			read("a.ts"),
			{ tool: "search", title: "TODO", status: "completed" },
			edit("a.ts"),
			edit("a.ts"),
			run("bun test"),
		];
		expect(summarizeWork(tools).summary).toBe(
			"Changed 1 file, ran 1 command, and performed 2 other actions",
		);
	});

	it("flags a failed call", () => {
		expect(summarizeWork([run("bun test", "failed")]).failed).toBe(true);
		expect(summarizeWork([run("bun test")]).failed).toBe(false);
	});
});

describe("work labels", () => {
	it("names one call by what it did, without saying its verb twice", () => {
		expect(workLabel(read("src/app.ts"))).toBe("Read app.ts");
		expect(workLabel(run("bun test"))).toBe("Ran bun test");
		expect(workLabel({ tool: "other", title: "mcp__linear__create" })).toBe("mcp__linear__create");
	});

	it("names the call under way", () => {
		expect(liveWorkLabel(read("src/app.ts"))).toBe("Reading app.ts");
		expect(liveWorkLabel(run("bun test"))).toBe("Running bun test");
	});

	it("gives a run one kind, or mixed", () => {
		expect(workKind([read("a"), read("b")])).toBe("read");
		expect(workKind([read("a"), run("ls")])).toBe("mixed");
	});
});

describe("thoughtLine", () => {
	it("takes a bold heading, or the first sentence, as plain words", () => {
		expect(thoughtLine("**Planning the fix**\nFirst I will…")).toBe("Planning the fix");
		expect(thoughtLine("I should read `app.ts` first. Then edit it.")).toBe(
			"I should read app.ts first.",
		);
	});
});
