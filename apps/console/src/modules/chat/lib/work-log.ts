import type { Block } from "./transcript";
import { toolFile } from "./transcript";

/**
 * The work log's words, ported from T3 Code's work-log presentation (MIT, © T3 Tools Inc.):
 * what one call did ("Read app.ts", "Ran bun test"), what it is doing while it runs
 * ("Reading app.ts"), and what a run of calls did in one sentence ("Read 3 files and ran 2
 * commands").
 */

type ToolBlock = Extract<Block, { kind: "tool" }>;
type ToolLike = Pick<ToolBlock, "tool" | "title" | "input" | "status" | "diffs">;

/** The kinds of work a run is summed up by. */
export type WorkAction = "read" | "edit" | "command" | "code-search" | "web" | "thought" | "other";

export function workAction(tool: Pick<ToolBlock, "tool">): WorkAction {
	switch (tool.tool) {
		case "read":
			return "read";
		case "edit":
			return "edit";
		case "execute":
			return "command";
		case "search":
			return "code-search";
		case "fetch":
			return "web";
		case "think":
			return "thought";
		default:
			return "other";
	}
}

function plural(count: number, one: string, many: string): string {
	return `${count} ${count === 1 ? one : many}`;
}

function actionLabel(action: WorkAction, count: number): string {
	switch (action) {
		case "read":
			return `Read ${plural(count, "file", "files")}`;
		case "edit":
			return `Changed ${plural(count, "file", "files")}`;
		case "command":
			return `Ran ${plural(count, "command", "commands")}`;
		case "code-search":
			return `Searched code ${plural(count, "time", "times")}`;
		case "web":
			return `Searched the web ${plural(count, "time", "times")}`;
		case "thought":
			return count === 1 ? "Thought" : `Thought (×${count})`;
		case "other":
			return `Used ${plural(count, "tool", "tools")}`;
	}
}

/** Edits count the files they touched, not the calls. */
function actionCount(action: WorkAction, tools: readonly ToolLike[]): number {
	if (action !== "edit") return tools.length;
	const files = new Set<string>();
	let unnamed = 0;
	for (const tool of tools) {
		const paths = tool.diffs?.map((diff) => diff.path) ?? [];
		const file = paths.length ? null : toolFile(tool);
		if (paths.length) for (const path of paths) files.add(path);
		else if (file) files.add(file);
		else unnamed += 1;
	}
	return files.size + unnamed;
}

/** What changes things leads the sentence; plain lookups follow; a stray tool comes last. */
function priority(action: WorkAction): number {
	if (action === "command" || action === "edit") return 0;
	if (action === "other") return 2;
	return 1;
}

/**
 * A run of calls in one sentence: the two most telling kinds of work, in the order they first
 * happened, and a count of the rest ("Changed 2 files, ran 3 commands, and performed 4 other
 * actions"). `failed` says whether any call failed.
 */
export function summarizeWork(tools: readonly ToolLike[]): { summary: string; failed: boolean } {
	const groups = new Map<WorkAction, ToolLike[]>();
	for (const tool of tools) {
		const action = workAction(tool);
		groups.set(action, [...(groups.get(action) ?? []), tool]);
	}
	const kinds = [...groups].map(([action, group], index) => ({
		action,
		index,
		size: group.length,
		label: actionLabel(action, actionCount(action, group)),
	}));
	const chosen = [...kinds]
		.sort((a, b) => priority(a.action) - priority(b.action) || a.index - b.index)
		.slice(0, 2)
		.sort((a, b) => a.index - b.index);
	const labels = chosen.map((kind) => kind.label);
	const rest = tools.length - chosen.reduce((sum, kind) => sum + kind.size, 0);
	if (rest > 0) labels.push(`Performed ${plural(rest, "other action", "other actions")}`);
	const words = labels.map((label, index) =>
		index === 0 ? label : label.charAt(0).toLowerCase() + label.slice(1),
	);
	const summary =
		words.length < 3
			? words.join(" and ")
			: `${words.slice(0, -1).join(", ")}, and ${words.at(-1)}`;
	return { summary, failed: tools.some((tool) => tool.status === "failed") };
}

/** The one kind of work a run did, for its icon; "mixed" when it did several. */
export function workKind(tools: readonly Pick<ToolBlock, "tool">[]): WorkAction | "mixed" {
	const actions = new Set(tools.map(workAction));
	return actions.size === 1 ? (actions.values().next().value ?? "mixed") : "mixed";
}

/** What a call acted on: its file, or its command or query as given. */
export function workTarget(tool: Pick<ToolBlock, "tool" | "title" | "input">): string {
	if (tool.tool === "read" || tool.tool === "edit") return toolFile(tool) ?? tool.title;
	return tool.title;
}

const DONE: Record<WorkAction, string> = {
	read: "Read",
	edit: "Edited",
	command: "Ran",
	"code-search": "Searched",
	web: "Fetched",
	thought: "Thought",
	other: "",
};

const DOING: Record<WorkAction, string> = {
	read: "Reading",
	edit: "Editing",
	command: "Running",
	"code-search": "Searching",
	web: "Fetching",
	thought: "Thinking",
	other: "Using",
};

/** One call as a line: "Read app.ts", "Ran bun test", or a tool's own title. */
export function workLabel(tool: Pick<ToolBlock, "tool" | "title" | "input">): string {
	const action = workAction(tool);
	const target = workTarget(tool);
	if (action === "other" || !DONE[action]) return tool.title || "Used a tool";
	// A title that already leads with its verb ("Read app.ts") is not said twice.
	if (target.toLowerCase().startsWith(DONE[action].toLowerCase())) return target;
	return `${DONE[action]} ${target}`;
}

/** The call under way: "Reading app.ts", "Running bun test". */
export function liveWorkLabel(tool: Pick<ToolBlock, "tool" | "title" | "input">): string {
	const action = workAction(tool);
	if (action === "other") return tool.title || "Working";
	return `${DOING[action]} ${workTarget(tool)}`;
}

/**
 * A thought's first line for its collapsed row: its bold heading when it opens with one,
 * otherwise its first sentence, with the markdown taken out.
 */
export function thoughtLine(markdown: string): string {
	const heading = /^\s*\*\*([^*\r\n]+)\*\*[ \t]*\r?(?:\n|$)/.exec(markdown)?.[1];
	const text = (heading ?? markdown)
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/^[ \t]*(?:#{1,6}|[-*+]|\d+\.)[ \t]+/gm, "")
		.replace(/`+|\*\*|~~/g, "")
		.replace(/(^|[^\w*])[*_]([^*_\n]+)[*_](?![\w*])/g, "$1$2")
		.replace(/\s+/g, " ")
		.trim();
	if (heading !== undefined) return text;
	const end = /[.?!]["'”’)]?(?=\s)/.exec(text);
	return end ? text.slice(0, end.index + end[0].length) : text;
}
