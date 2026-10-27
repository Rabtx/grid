import type { ChatEvent, Choice } from "./events";
import type { Sandbox } from "../sandbox/sandbox";
import type { UsageLimit } from "./rate-limits";

/** An MCP server an agent starts with: a command it runs and speaks to over stdio. */
export type McpServerSpec = {
	name: string;
	command: string;
	args: string[];
	env: Record<string, string>;
};

export type AgentContext = {
	cwd: string;
	model?: string;
	mode?: string;
	/** Reasoning effort for the model, when it has levels. */
	effort?: string;
	/** The provider's own session id from an earlier run, to continue that conversation. */
	resume?: string;
	/**
	 * Continue `resume` as a new conversation of its own, leaving that one as it was: a fork that
	 * keeps everything the agent knew. Only asked of an agent whose capabilities say `fork`.
	 */
	fork?: boolean;
	/** Environment for the agent's process beyond the runner's own: who its commits are by. */
	env?: Record<string, string>;
	/** Run the agent in this container instead of on the machine (see `sandbox/sandbox.ts`). */
	sandbox?: Sandbox;
	/** The workspace's connectors this agent may use (Settings → Connectors). */
	mcpServers?: McpServerSpec[];
	emit: (event: ChatEvent) => void;
	/** How much of its plan's limits the account has used, whenever the agent says. */
	onRateLimits?: (limits: UsageLimit[]) => void;
	/** The provider's session id, once it has one: stored so a later run can resume. */
	onResumeToken: (token: string) => void;
};

export type TurnResult = { reason: "done" | "cancelled" | "error"; error?: string };

/** One running conversation with an agent process. */
export type AgentSession = {
	/**
	 * Set when `AgentContext.resume` was asked: whether that conversation was picked up (or
	 * forked). False when the agent no longer had it and began a new one, which knows nothing of
	 * the thread: Grid tells it the conversation with the next message.
	 */
	resumed?: boolean;
	/** Send a message; resolves when the agent has finished the turn. */
	prompt: (text: string, images?: { mimeType: string; data: string }[]) => Promise<TurnResult>;
	cancel: () => void;
	/** Answer an approval request; null means dismissed. */
	approve: (id: string, optionId: string | null) => void;
	/**
	 * Deliver a message into the turn going on, for an agent that can take one mid-turn. False
	 * when there was no turn to deliver it into. Agents without it are stopped and sent it next.
	 */
	steer?: (text: string, images?: { mimeType: string; data: string }[]) => Promise<boolean>;
	/** Answer a `question` event: picked labels or typed text per question id; null dismisses. */
	answer?: (id: string, answers: Record<string, string[]> | null) => void;
	setModel: (model: string) => Promise<void>;
	setMode: (mode: string) => Promise<void>;
	setEffort: (effort: string) => Promise<void>;
	close: () => void;
};

/**
 * What an agent can do beyond sending a message and stopping, so Grid chooses how to do the rest
 * by what the agent says rather than by which agent it is:
 *
 * - `steer`: a message sent while it works goes into the turn (`native`), or the turn is stopped
 *   and the message starts the next one, told it was stopped for it (`restart`);
 * - `resume`: it continues its own conversation in a new process from a stored session id;
 * - `fork`: it branches that conversation into a new one (`AgentContext.fork`), so a fork keeps
 *   all the agent knew; without it a fork is told the conversation instead.
 */
export type AgentCapabilities = {
	steer: "native" | "restart";
	resume: boolean;
	fork: boolean;
};

/** What Grid assumes of an agent that says nothing: the least, which always works. */
export const BASIC_CAPABILITIES: AgentCapabilities = {
	steer: "restart",
	resume: false,
	fork: false,
};

/** An agent's capabilities, with what it leaves out at the basic level. */
export function capabilitiesOf(info: Pick<ProviderInfo, "capabilities">): AgentCapabilities {
	return { ...BASIC_CAPABILITIES, ...info.capabilities };
}

export type ProviderInfo = {
	id: string;
	name: string;
	available: boolean;
	/** See `AgentCapabilities`; left out, the basic ones. */
	capabilities?: Partial<AgentCapabilities>;
	/** Models known before a session starts; the agent may report a fuller list once running. */
	models: Choice[];
	modes: Choice[];
	defaultMode?: string;
};

export type Provider = {
	info: () => ProviderInfo;
	/**
	 * The agent's real model list (exact names, effort levels), asked of the agent itself. Slower
	 * than `info`, so callers cache it; when it fails, `info().models` is the fallback.
	 */
	catalog?: (fresh?: boolean) => Promise<{ models: Choice[]; modes?: Choice[] }>;
	start: (context: AgentContext) => Promise<AgentSession>;
};
