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

export type ChatEvent =
	| { type: "user"; text: string; attachments?: ChatAttachment[] }
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
	/**
	 * What the agent can be asked to do right now, for the composer's `/` menu. It is not part of
	 * the conversation: the runner sends it on attach and whenever it changes, and never logs it.
	 */
	| { type: "commands"; commands: AgentCommand[] }
	/** The turn's reply restated exactly: replaces the text and reasoning shown since the message. */
	| { type: "turn_rewrite"; events: TurnEvent[] };

/** What a rewritten turn is made of. */
export type TurnEvent = Extract<ChatEvent, { type: "message" | "reasoning" | "tool" | "plan" }>;

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
	createdAt: string;
	updatedAt: string;
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
export type ProjectChatSettings = { worktrees: boolean };

/** An agent the runner can drive, and whether it is installed. */
export type ChatProvider = {
	id: string;
	name: string;
	available: boolean;
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
};

/** Your choices for one agent, kept by the runner. Unset means the agent's own default. */
export type ProviderSettings = {
	/** False hides the agent from new chats. */
	enabled?: boolean;
	model?: string;
	effort?: string;
	mode?: string;
};
