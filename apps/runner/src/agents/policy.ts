import type { WorkspaceSettings } from "../auth";
import type { ApprovalOption, ToolKind } from "./events";

/**
 * What agents may do on their own in a workspace (Settings → Agents & permissions): for each kind
 * of action, go ahead, ask the person, or never. When an agent asks permission, the runner answers
 * for the person where the workspace has already decided; everything else waits for them.
 */

export const CAPABILITIES = ["read", "edit", "commands", "packages", "network", "push"] as const;
export type Capability = (typeof CAPABILITIES)[number];
export type Rule = "allow" | "ask" | "never";

export type AgentPolicy = {
	rules: Record<Capability, Rule>;
	/** Agents never commit straight to the default branch. */
	newBranch: boolean;
	/** Every command waits for the person, even when commands are allowed. */
	showCommands: boolean;
};

/** What agents do today: reading goes ahead, everything else asks. */
export const DEFAULT_POLICY: AgentPolicy = {
	rules: {
		read: "allow",
		edit: "ask",
		commands: "ask",
		packages: "ask",
		network: "ask",
		push: "ask",
	},
	newBranch: false,
	showCommands: false,
};

/** A workspace's policy over the defaults. */
export function policyOf(settings: WorkspaceSettings | undefined): AgentPolicy {
	const saved = settings?.agentPolicy;
	return {
		rules: { ...DEFAULT_POLICY.rules, ...saved?.rules },
		newBranch: saved?.newBranch ?? DEFAULT_POLICY.newBranch,
		showCommands: saved?.showCommands ?? DEFAULT_POLICY.showCommands,
	};
}

const PUSH = /\bgit\s+push\b/;
const PACKAGES =
	/\b(?:npm|pnpm|yarn|bun)\s+(?:i|install|add)\b|\bpip3?\s+install\b|\bcargo\s+(?:add|install)\b|\bbrew\s+install\b|\bapt(?:-get)?\s+install\b|\bgo\s+get\b/;
const NETWORK = /\b(?:curl|wget|ssh|scp|rsync)\b|https?:\/\//;

/** Which kind of action a permission request is, from what the agent says it will do. */
export function capabilityOf(text: string, kind?: ToolKind): Capability {
	if (PUSH.test(text)) return "push";
	if (PACKAGES.test(text)) return "packages";
	if (kind === "fetch") return "network";
	if (kind === "read" || kind === "search") return "read";
	if (kind === "edit") return "edit";
	if (kind === "execute") return NETWORK.test(text) ? "network" : "commands";
	if (/^(?:edit|write|create|delete|move|rename)\b/i.test(text)) return "edit";
	if (/^(?:read|view|list|search|grep|glob|find)\b/i.test(text)) return "read";
	return NETWORK.test(text) ? "network" : "commands";
}

/** Whether a push names the default branch (`git push origin main`, `git push origin HEAD:main`). */
function pushesTo(text: string, branch: string): boolean {
	const escaped = branch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`\\bgit\\s+push\\b[^\\n]*(?:\\s|:)${escaped}(?:\\s|$)`).test(text);
}

/**
 * The runner's answer to a permission request: the option to choose for the person, or null to
 * leave it for them.
 */
export function answerFor(
	policy: AgentPolicy,
	request: { title: string; detail?: string; options: readonly ApprovalOption[] },
	kind: ToolKind | undefined,
	defaultBranch = "main",
): string | null {
	const text = `${request.title}\n${request.detail ?? ""}`;
	const capability = capabilityOf(text, kind);
	let rule = policy.rules[capability];
	if (policy.newBranch && capability === "push" && pushesTo(text, defaultBranch)) rule = "never";
	if (policy.showCommands && rule === "allow" && capability !== "read" && capability !== "edit")
		rule = "ask";
	if (rule === "ask") return null;
	const option = request.options.find(
		(item) => item.kind === (rule === "allow" ? "allow" : "deny"),
	);
	return option?.id ?? null;
}

/** The first message's note when the workspace keeps agents off its default branch. */
export function branchNote(policy: AgentPolicy, defaultBranch = "main"): string | null {
	return policy.newBranch
		? `Never commit straight to ${defaultBranch}: make a branch for your change first, and do not push to ${defaultBranch}.`
		: null;
}
