import type { FileDiff } from "./diff";

/** A file sent with a message; its bytes stay with the runner that took it. */
export type ChatAttachment = { id: string; name: string; size: number; mimeType: string };

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

/**
 * One command the agent itself offers, as the person types it: `/name`, what it does, and the
 * argument it takes when the agent says (`<what to design>` and the like). The name is what the
 * agent will see, so it is the agent's own — never one Grid made up.
 */
export type AgentCommand = { name: string; description: string; hint?: string };

/** One question an agent asks the person, with the answers it offers (none: type an answer). */
export type AgentQuestion = {
	id: string;
	/** A short label for the question ("Database", "Scope"). */
	header: string;
	question: string;
	options: { label: string; description?: string }[];
	/** More than one option may be picked. */
	multiSelect?: boolean;
};

export type SubagentStatus = "running" | "completed" | "failed" | "cancelled";

/**
 * Who a message is from when the person did not type it: Grid itself (carrying a turn on after
 * the runner restarted, or reporting on threads this one's agent started), another thread's
 * agent (Grid's thread tools), or a fork's work brought back into the thread it branched from.
 */
export type MessageOrigin =
	| { kind: "grid"; reason: "restart" | "report" }
	| { kind: "agent"; thread: { id: string; title: string } }
	| { kind: "merge"; thread: { id: string; title: string } };

/** A message waiting for the agent to finish its turn; sent in order once it does. */
export type QueuedMessage = {
	id: string;
	text: string;
	attachments?: ChatAttachment[];
	origin?: MessageOrigin;
	/** Sent into a turn the agent could not take it into: that turn was stopped for it. */
	steered?: boolean;
};

/** A file a turn changed, as its checkpoint counts it. */
export type CheckpointFile = { path: string; added: number; removed: number };

export type ChatEvent =
	/** What the person sent. */
	| {
			type: "user";
			/** Names the message, for forking from it; older logs lack it. */
			id?: string;
			text: string;
			attachments?: ChatAttachment[];
			/** Not typed by the person (see `MessageOrigin`). */
			origin?: MessageOrigin;
			/** Sent while the agent worked: the turn it could not take it into was stopped for it. */
			steered?: boolean;
	  }
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
			/** The subagent that made this call, when it was not the agent itself. */
			parent?: string;
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
	/** `at`: when the turn began (ISO time), for how long it has been working. Older logs lack it. */
	| { type: "turn_start"; at?: string }
	| {
			type: "turn_end";
			reason: "done" | "cancelled" | "error";
			error?: string;
			at?: string;
			/** A failed turn that sending the message again can fix (a busy provider, a gone model). */
			retryable?: boolean;
			/** Stopped so a message sent meanwhile could go in: the next turn carries on with it. */
			restarted?: boolean;
			/** Cut off by the runner restarting, and carried on by Grid in the next turn. */
			continued?: boolean;
	  }
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
	| { type: "error"; message: string }
	/** What the person sent while the agent was working, delivered into the turn going on. */
	| { type: "steer"; text: string; attachments?: ChatAttachment[]; origin?: MessageOrigin }
	/** The agent asks the person something and waits for the answer. */
	| { type: "question"; id: string; questions: AgentQuestion[] }
	/** Answers by question id (each a list of picked labels or typed text); null when dismissed. */
	| { type: "question_answered"; id: string; answers: Record<string, string[]> | null }
	/**
	 * A child agent the agent started (Claude's Task, a Codex sub-agent), created or updated by
	 * id. Its own tool calls carry `parent: id`.
	 */
	| {
			type: "subagent";
			id: string;
			title?: string;
			/** The kind of agent it is ("general-purpose", "Explore"). */
			agent?: string;
			status?: SubagentStatus;
			/** What it was asked to do. */
			prompt?: string;
			/** What it reported back. */
			result?: string;
			/** The last thing it said or did, for a one-line status. */
			activity?: string;
			at?: string;
			endedAt?: string;
	  }
	/** A visual the agent put in its reply (see `visuals.ts`): native blocks, or a sandboxed page. */
	| {
			type: "visual";
			id: string;
			title: string;
			format: "components" | "html";
			/** The blocks, for `components`. */
			blocks?: unknown[];
			/** The page, for `html`. */
			html?: string;
			height?: number;
	  }
	/**
	 * The working tree as a turn left it, saved under a git ref: `files` is what the turn changed,
	 * and `turn` is which turn it was (counted from 1). Undo puts the tree back to before it.
	 */
	| { type: "checkpoint"; turn: number; files: CheckpointFile[]; at?: string }
	/** The working tree was put back to how it was before `turn`. */
	| { type: "checkpoint_restored"; turn: number; files: CheckpointFile[]; at?: string }
	/** The thread moved to another agent: earlier turns are the `from` agent's, later ones `to`'s. */
	| {
			type: "handoff";
			from: { provider: string; model?: string | null };
			to: { provider: string; model?: string | null };
			/**
			 * The thread goes back to an agent it was with before, which continues its own
			 * conversation from when it left (after this many turns) and is told only the rest.
			 */
			resumes?: { turns: number };
			at?: string;
	  }
	/** Where a forked thread's own work begins: everything above came from `from`. */
	| { type: "forked"; from: { id: string; title: string }; at?: string }
	/** This fork's work since it branched was brought back into the thread it came from. */
	| { type: "merged"; into: { id: string; title: string }; turns: number; at?: string }
	/**
	 * The messages waiting for the agent, and whether sending them is paused (after a stop or a
	 * failure). Like `commands`, not part of the log: sent on attach and whenever it changes.
	 */
	| { type: "queue"; items: QueuedMessage[]; paused: boolean }
	/** The agent opened a page in the thread's browser (Grid's browser tools): the pane shows it. */
	| { type: "browser"; url: string; title: string }
	/**
	 * The commands this agent offers, as it reported them: the whole list, each time it changes.
	 * Not part of the conversation — the hub keeps the latest list per live session and sends it
	 * again to a device that attaches, rather than writing it into the log.
	 */
	| { type: "commands"; commands: AgentCommand[] };

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
