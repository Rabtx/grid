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

export type ApprovalOption = { id: string; label: string; kind: "allow" | "allow_always" | "deny" };

export type ChatEvent =
	| { type: "user"; text: string }
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
	| { type: "turn_start" }
	| { type: "turn_end"; reason: "done" | "cancelled" | "error"; error?: string }
	| {
			type: "info";
			models?: Choice[];
			model?: string;
			modes?: Choice[];
			mode?: string;
			efforts?: Choice[];
			effort?: string;
	  }
	| { type: "error"; message: string };

/** A chat session as the runner lists it. */
export type ChatSession = {
	id: string;
	project: string;
	provider: string;
	title: string;
	cwd: string;
	model: string | null;
	mode: string | null;
	effort: string | null;
	createdAt: string;
	updatedAt: string;
};

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
