import type { FileDiff } from "./diff";

/**
 * The one stream every agent is translated into. Providers speak different protocols (ACP,
 * Claude's stream-json, Codex's app-server); each adapter maps its own onto these events, and
 * the console only ever sees these. Text and reasoning arrive as deltas to append; tools and
 * approvals are upserted by id, so a later event for the same id updates the earlier one.
 */

/** Something to pick: a model, a mode, an effort level. */
export type Choice = {
	id: string;
	name: string;
	description?: string;
	/** For long lists: the heading it is listed under (a model's provider, say). */
	group?: string;
	/** A model's reasoning-effort levels, when it has them. */
	efforts?: Choice[];
	defaultEffort?: string;
};

export type ToolKind = "read" | "edit" | "execute" | "search" | "fetch" | "think" | "other";

export type ToolStatus = "pending" | "running" | "completed" | "failed";

export type PlanEntry = { text: string; status: "pending" | "in_progress" | "completed" };

export type ApprovalOption = { id: string; label: string; kind: "allow" | "allow_always" | "deny" };

export type ChatEvent =
	/** What the person sent. */
	| { type: "user"; text: string }
	/** A piece of the agent's reply (Markdown). */
	| { type: "message"; text: string }
	/** A piece of the agent's visible reasoning. */
	| { type: "reasoning"; text: string }
	/** A tool call, created or updated. Fields left out keep their earlier value. */
	| {
			type: "tool";
			id: string;
			title?: string;
			kind?: ToolKind;
			status?: ToolStatus;
			/** What the tool was asked to do: a command, a path, a query. */
			input?: string;
			/** What came back, trimmed for display. */
			output?: string;
			/** The files an edit changed, as unified diffs. */
			diffs?: FileDiff[];
	  }
	/** The agent wants permission before it acts. */
	| { type: "approval"; id: string; title: string; detail?: string; options: ApprovalOption[] }
	| { type: "approval_resolved"; id: string; optionId: string | null }
	/** The agent's current plan or todo list, replacing the previous one. */
	| { type: "plan"; entries: PlanEntry[] }
	| {
			type: "usage";
			inputTokens?: number;
			outputTokens?: number;
			contextUsed?: number;
			contextWindow?: number;
			costUsd?: number;
	  }
	| { type: "turn_start" }
	| { type: "turn_end"; reason: "done" | "cancelled" | "error"; error?: string }
	/** What the agent offers and has chosen: models, modes. Sent when it changes. */
	| {
			type: "info";
			models?: Choice[];
			model?: string;
			modes?: Choice[];
			mode?: string;
			/** Effort levels for the current model, when the agent reports them live. */
			efforts?: Choice[];
			effort?: string;
	  }
	| { type: "error"; message: string };

/** Output shown in the transcript is capped: a tool can print megabytes. */
export const MAX_TOOL_OUTPUT = 16 * 1024;

// Terminal colour and cursor codes (`ls --color`, progress bars): noise in a chat transcript.
// oxlint-disable-next-line no-control-regex -- escape sequences are made of control characters
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*(?:\x07|\x1b\\)/g;

/** Tool output as the transcript shows it: without terminal codes, and capped in size. */
export function clip(raw: string, limit = MAX_TOOL_OUTPUT): string {
	const text = raw.replace(ANSI, "");
	if (text.length <= limit) return text;
	const head = text.slice(0, limit / 2);
	const tail = text.slice(-limit / 2);
	return `${head}\n… ${text.length - limit} characters not shown …\n${tail}`;
}
