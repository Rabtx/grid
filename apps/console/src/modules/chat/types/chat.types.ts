export type ChatAttachment = { id: string; name: string; size: number; mimeType: string };
/** The runner's chat event stream (apps/runner/src/agents/events.ts). */

/** Something to pick: a model, a mode, an effort level. */
export type Choice = {
	id: string;
	name: string;
	description?: string;
	/** The heading it is listed under (a model's provider). */
	group?: string;
	/** A model's reasoning-effort levels, when it has them. */
	efforts?: Choice[];
	defaultEffort?: string;
};

export type ToolKind = "read" | "edit" | "execute" | "search" | "fetch" | "think" | "other";

export type ToolStatus = "pending" | "running" | "completed" | "failed";

export type PlanEntry = { text: string; status: "pending" | "in_progress" | "completed" };

/** A command an agent offers, as the runner reports it (apps/runner/src/agents/events.ts). */
export type AgentCommand = { name: string; description: string; hint?: string };

export type ApprovalOption = { id: string; label: string; kind: "allow" | "allow_always" | "deny" };

/** A question an agent asks, with the answers it offers (none: type an answer). */
export type AgentQuestion = {
	id: string;
	header: string;
	question: string;
	options: { label: string; description?: string }[];
	multiSelect?: boolean;
};

export type SubagentStatus = "running" | "completed" | "failed" | "cancelled";

/**
 * Why Grid itself sent a message: carrying a turn on after a restart, reporting on threads this
 * one started, carrying on after a usage limit reset, pull request news, the thread's goal, or
 * compacting an idle conversation.
 */
export type GridReason = "restart" | "report" | "limit" | "pull" | "goal" | "compact";

/** Where a thread's goal stands. */
export type GoalStatus = "active" | "paused" | "met" | "blocked" | "cleared";

/**
 * Who a message is from when the person did not type it: Grid (carrying a turn on after the
 * runner restarted, or reporting on threads this one started), another thread's agent, or a
 * fork's work brought back.
 */
export type MessageOrigin =
	| { kind: "grid"; reason: GridReason }
	| { kind: "agent"; thread: { id: string; title: string } }
	| { kind: "merge"; thread: { id: string; title: string } }
	/** An agent outside Grid, with a person's agent key (Settings → Agent keys). */
	| { kind: "outside"; agent: string }
	/** A guest following a shared link, sent on by the thread's person. */
	| { kind: "guest"; name: string };

/** A message waiting for the agent to finish its turn. */
export type QueuedMessage = {
	id: string;
	text: string;
	attachments?: ChatAttachment[];
	origin?: MessageOrigin;
	/** Its turn was stopped for it (an agent that cannot take a message mid-turn). */
	steered?: boolean;
};

/** A file a turn changed, as its checkpoint counts it. */
export type CheckpointFile = { path: string; added: number; removed: number };

export type ChatEvent =
	| {
			type: "user";
			id?: string;
			text: string;
			attachments?: ChatAttachment[];
			origin?: MessageOrigin;
			/** Sent while the agent worked; the turn it could not take it into was stopped for it. */
			steered?: boolean;
	  }
	| { type: "message"; text: string }
	| { type: "reasoning"; text: string }
	| {
			type: "tool";
			id: string;
			title?: string;
			kind?: ToolKind;
			status?: ToolStatus;
			input?: string;
			output?: string;
			diffs?: FileDiff[];
			/** The subagent that made the call. */
			parent?: string;
	  }
	| { type: "approval"; id: string; title: string; detail?: string; options: ApprovalOption[] }
	| { type: "approval_resolved"; id: string; optionId: string | null }
	| { type: "plan"; entries: PlanEntry[] }
	| {
			type: "usage";
			inputTokens?: number;
			outputTokens?: number;
			contextUsed?: number;
			contextWindow?: number;
			costUsd?: number;
	  }
	/** `at`: when the turn began (ISO time); older logs lack it. */
	| { type: "turn_start"; at?: string }
	| {
			type: "turn_end";
			reason: "done" | "cancelled" | "error";
			error?: string;
			at?: string;
			/** A failed turn that sending the message again can fix (a busy provider, a gone model). */
			retryable?: boolean;
			/** Stopped so a message sent meanwhile could go in; the next turn carries on with it. */
			restarted?: boolean;
			/** Cut off by the runner restarting, and carried on by Grid in the next turn. */
			continued?: boolean;
	  }
	| {
			type: "info";
			models?: Choice[];
			model?: string;
			modes?: Choice[];
			mode?: string;
			efforts?: Choice[];
			effort?: string;
	  }
	| { type: "error"; message: string }
	| { type: "steer"; text: string; attachments?: ChatAttachment[]; origin?: MessageOrigin }
	| { type: "question"; id: string; questions: AgentQuestion[] }
	| { type: "question_answered"; id: string; answers: Record<string, string[]> | null }
	| {
			type: "subagent";
			id: string;
			title?: string;
			agent?: string;
			status?: SubagentStatus;
			prompt?: string;
			result?: string;
			activity?: string;
			at?: string;
			endedAt?: string;
	  }
	| {
			type: "visual";
			id: string;
			title: string;
			format: "components" | "html";
			blocks?: unknown[];
			html?: string;
			height?: number;
	  }
	| { type: "checkpoint"; turn: number; files: CheckpointFile[]; at?: string }
	| { type: "checkpoint_restored"; turn: number; files: CheckpointFile[]; at?: string }
	| { type: "forked"; from: { id: string; title: string }; at?: string }
	/** A usage limit stopped the thread; Grid carries it on at `resetsAt` unless `ended`. */
	| { type: "limit_wait"; resetsAt: string; ended?: "resumed" | "cancelled"; at?: string }
	/** The thread's goal changed (`/goal`). */
	| {
			type: "goal";
			objective: string;
			status: GoalStatus;
			turns: number;
			maxTurns: number;
			note?: string;
			at?: string;
	  }
	/** A guest with the thread's link asked something; it waits for the person to send it on. */
	| { type: "guest_request"; id: string; name: string; text: string; at?: string }
	| { type: "guest_request_resolved"; id: string; action: "sent" | "dismissed"; at?: string }
	/** This fork's work was brought back into the thread it came from. */
	| { type: "merged"; into: { id: string; title: string }; turns: number; at?: string }
	| {
			type: "handoff";
			from: { provider: string; model?: string | null };
			to: { provider: string; model?: string | null };
			/** Back to an agent it was with: it continues its own conversation from this many turns. */
			resumes?: { turns: number };
			at?: string;
	  }
	/** What waits for the agent, and whether it is held. Like `commands`, never logged. */
	| { type: "queue"; items: QueuedMessage[]; paused: boolean }
	/** The agent opened a page in the thread's browser: the browser pane shows it. */
	| { type: "browser"; url: string; title: string }
	/**
	 * What the agent can be asked to do right now, for the composer's `/` menu. It is not part of
	 * the conversation: the runner sends it on attach and whenever it changes, and never logs it.
	 */
	| { type: "commands"; commands: AgentCommand[] };

/** A file an edit changed, as the runner sends it: unified hunks and line counts. */
export type FileDiff = {
	path: string;
	patch: string;
	added: number;
	removed: number;
	/** Cut from the middle of a file, so its line numbers are not the file's. */
	snippet?: boolean;
};

/** A chat session as the runner lists it. */
/** A role on the workspace's team (Figma 11 · Agent roles): a named preset a thread starts as. */
export type Role = {
	id: string;
	name: string;
	/** One of the kit's role glyphs. */
	icon: string;
	/** What the role does; the agent is given it with a thread's first message. */
	brief: string;
	provider: string;
	/** Unset means the agent's own default. */
	model: string | null;
	effort: string | null;
	mode: string | null;
	createdAt: string;
	updatedAt: string;
};

export type RoleDraft = Pick<
	Role,
	"name" | "icon" | "brief" | "provider" | "model" | "effort" | "mode"
>;

/** The role a thread was started as, as the role was then. */
export type SessionRole = { id: string; name: string; icon: string; brief: string };

export type ChatSession = {
	id: string;
	project: string;
	provider: string;
	title: string;
	cwd: string;
	model: string | null;
	mode: string | null;
	effort: string | null;
	/** Its own git worktree and branch, when it has one (`cwd` is inside it). */
	worktree?: {
		repo: string;
		path: string;
		branch: string;
		base: string | null;
		origin: string;
	} | null;
	/** The role it was started as, if any. */
	role?: SessionRole | null;
	/** A side chat's thread, when this is one. */
	parentId?: string | null;
	/** The provider account it runs as; null is the machine's own sign-in. */
	account?: string | null;
	/** The thread whose agent started this one with Grid's thread tools, if one did. */
	delegatedBy?: string | null;
	/** Snoozed until then (ISO): its finished turns do not ask for attention before it. */
	snoozedUntil?: string | null;
	createdAt: string;
	updatedAt: string;
};

/** A thread's browser page: whether one is open, where, and a count that rises as it changes. */
export type BrowserState = {
	available?: boolean;
	open: boolean;
	url: string;
	title: string;
	version: number;
};

/** A second sign-in with an agent's provider on a machine (another Claude or ChatGPT plan). */
export type ProviderAccount = { id: string; provider: string; label: string; createdAt: string };

/** One window of a plan's limits, as the agent last reported it. */
export type UsageLimit = {
	window: string;
	usedPercent: number | null;
	resetsAt: string | null;
	limited: boolean;
};

/** What an account (null: the machine's own sign-in) has used of its plan. */
export type AccountUsage = {
	provider: string;
	account: string | null;
	limits: UsageLimit[];
	updatedAt: string;
};

export type AccountsListing = {
	/** The agents that can run as another account here. */
	supported: string[];
	accounts: ProviderAccount[];
	usage: AccountUsage[];
};

/** How a chat's worktree stands: what removing it would throw away. */
export type WorktreeStatus = {
	branch: string;
	base: string | null;
	path: string;
	exists: boolean;
	/** Files changed and not committed. */
	changed: number;
	/** Commits on its branch that are on no remote and not in its base. */
	unpushed: number;
	/** The branch was not made for the thread (a pull request's): removing the worktree keeps it. */
	adopted?: boolean;
};

/** A project's chat settings on the machine it runs on. */
export type ProjectChatSettings = {
	worktrees: boolean;
	/** Idle Claude Code threads with a large conversation are compacted before their cache expires. */
	idleCompact?: boolean;
};

/** An agent the runner can drive, and whether it is installed. */
export type ChatProvider = {
	id: string;
	name: string;
	available: boolean;
	/**
	 * What it can do beyond the basics (apps/runner/src/agents/provider.ts): whether a message
	 * sent while it works goes into the turn (`native`) or stops it and starts the next (`restart`).
	 */
	capabilities?: { steer?: "native" | "restart"; resume?: boolean; fork?: boolean };
	models: Choice[];
	modes: Choice[];
	defaultMode?: string;
	/** When the model list was last asked of the agent; null when it never answered. */
	refreshedAt?: string | null;
	settings?: ProviderSettings;
	/** Whether Grid can install or sign it in on its machine, and whether it is signed in. */
	setup?: {
		canInstall: boolean;
		canSignIn: boolean;
		signInOptional: boolean;
		signedIn: boolean | null;
		docs: string | null;
	};
	/** Its version, when it says (`v2.1.4`). */
	version?: string | null;
	/** Added from Settings (an ACP agent), so it can be removed there. */
	custom?: boolean;
};

/** Your choices for one agent, kept by the runner. Unset means the agent's own default. */
export type ProviderSettings = {
	/** False hides the agent from new chats. */
	enabled?: boolean;
	model?: string;
	effort?: string;
	mode?: string;
};

export type CrewWorkerState = "queued" | "working" | "done" | "failed" | "stopped" | "needs_you";

/** A crew member: a worker thread its coordinator started for one task. */
export type CrewWorker = {
	id: string;
	key: string;
	title: string;
	brief: string;
	provider: string;
	model: string | null;
	sessionId: string | null;
	state: CrewWorkerState;
	attempts: number;
	running: boolean;
	/** Its turn waits on a person: an approval or a question. */
	waiting: boolean;
	updatedAt: string;
};

/** A crew: a coordinator thread and the members it started. */
export type Crew = {
	id: string;
	project: string;
	name: string;
	coordinatorId: string;
	instructions: string;
	workerProvider: string;
	workerModel: string | null;
	parallel: number;
	paused: boolean;
	createdAt: string;
	workers: CrewWorker[];
};

/** A thread with a turn in flight, and whether it waits on a person (an approval, a question). */
export type RunningThread = { id: string; project: string; waiting: boolean };

/** An approval waiting in a running thread, as the runner lists them across a workspace. */
export type WaitingApproval = {
	sessionId: string;
	project: string;
	thread: string;
	provider: string;
	approval: { id: string; title: string; detail: string | null; options: ApprovalOption[] };
};

/** A thread's goal as the runner keeps it. */
export type ThreadGoal = {
	sessionId: string;
	objective: string;
	status: GoalStatus;
	turns: number;
	maxTurns: number;
	updatedAt: string;
};
