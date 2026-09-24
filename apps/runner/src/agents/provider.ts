import type { ChatEvent, Choice } from "./events";

/** How a provider's session reports what happens. */
export type AgentContext = {
	cwd: string;
	model?: string;
	mode?: string;
	/** The provider's own session id from an earlier run, to continue that conversation. */
	resume?: string;
	emit: (event: ChatEvent) => void;
	/** The provider's session id, once it has one: stored so a later run can resume. */
	onResumeToken: (token: string) => void;
};

export type TurnResult = { reason: "done" | "cancelled" | "error"; error?: string };

/** One running conversation with an agent process. */
export type AgentSession = {
	/** Send a message; resolves when the agent has finished the turn. */
	prompt: (text: string) => Promise<TurnResult>;
	cancel: () => void;
	/** Answer an approval request; null means dismissed. */
	approve: (id: string, optionId: string | null) => void;
	setModel: (model: string) => Promise<void>;
	setMode: (mode: string) => Promise<void>;
	close: () => void;
};

export type ProviderInfo = {
	id: string;
	name: string;
	available: boolean;
	/** Models known before a session starts; the agent may report a fuller list once running. */
	models: Choice[];
	modes: Choice[];
	defaultMode?: string;
};

export type Provider = {
	info: () => ProviderInfo;
	start: (context: AgentContext) => Promise<AgentSession>;
};
