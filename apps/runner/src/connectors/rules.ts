import type { Capability, Rule } from "./catalog";

/**
 * What an agent may do with one tool of a connected service: its capability's rule, narrowed by
 * what the agent itself is allowed (read only, or nothing), the repositories the workspace shares
 * with agents, and — for GitHub — never writing straight to the default branch when that is off.
 */

/** Per agent: the connector's rules, reading only, or no access. */
export type AgentAccess = "rules" | "read" | "off";

export type ToolPolicy = {
	capabilities: { id: string; tools: string; flags: string; rule: Rule; read: boolean }[];
	agent: AgentAccess;
	/** GitHub: the repositories agents may work in (`owner/name`), or null for all. */
	repositories: string[] | null;
	/** GitHub: the branch "Push to main" protects. */
	defaultBranch: string;
	/** GitHub: the rule for writing to the default branch. */
	pushMain: Rule | null;
};

/** A policy that can cross a process boundary (the proxy reads it as JSON). */
export function toolPolicy(
	capabilities: readonly Capability[],
	rules: Record<string, Rule>,
	agent: AgentAccess,
	extra: { repositories?: string[] | null; defaultBranch?: string } = {},
): ToolPolicy {
	return {
		capabilities: capabilities.map((item) => ({
			id: item.id,
			tools: item.tools.source,
			flags: item.tools.flags,
			rule: rules[item.id] ?? item.initial,
			read: item.read === true,
		})),
		agent,
		repositories: extra.repositories ?? null,
		defaultBranch: extra.defaultBranch ?? "main",
		pushMain: capabilities.some((item) => item.id === "push_main")
			? (rules.push_main ?? "never")
			: null,
	};
}

export type Decision = { rule: Rule; capability: string | null; reason?: string };

/** The capability a tool belongs to: the first that claims it, else reading or the last one. */
function capabilityOf(policy: ToolPolicy, tool: string) {
	const claimed = policy.capabilities.find(
		(item) => item.tools && new RegExp(item.tools, item.flags).test(tool) && item.tools !== "^$",
	);
	return claimed ?? null;
}

function stringArg(args: Record<string, unknown>, ...keys: string[]): string | null {
	for (const key of keys) {
		const value = args[key];
		if (typeof value === "string" && value) return value;
	}
	return null;
}

/** Whether an agent may call this tool with these arguments, and why not. */
export function decide(
	policy: ToolPolicy,
	tool: string,
	args: Record<string, unknown> = {},
): Decision {
	if (policy.agent === "off") return { rule: "never", capability: null, reason: "No access" };
	const capability = capabilityOf(policy, tool);
	let rule: Rule = capability?.rule ?? "ask";
	if (policy.agent === "read" && !capability?.read)
		return { rule: "never", capability: capability?.id ?? null, reason: "This agent reads only" };

	const owner = stringArg(args, "owner");
	const repo = stringArg(args, "repo", "repository");
	if (policy.repositories && owner && repo) {
		const name = `${owner}/${repo}`.toLowerCase();
		if (!policy.repositories.some((item) => item.toLowerCase() === name))
			return {
				rule: "never",
				capability: capability?.id ?? null,
				reason: `${owner}/${repo} is not shared with agents`,
			};
	}
	const branch = stringArg(args, "branch", "base");
	if (policy.pushMain && branch === policy.defaultBranch && !capability?.read) {
		const strictest = order(policy.pushMain) > order(rule) ? policy.pushMain : rule;
		if (strictest !== rule || policy.pushMain === "never")
			return {
				rule: strictest,
				capability: "push_main",
				reason: strictest === "never" ? `Agents don't write to ${branch}` : undefined,
			};
		rule = strictest;
	}
	return { rule, capability: capability?.id ?? null };
}

function order(rule: Rule): number {
	return rule === "never" ? 2 : rule === "ask" ? 1 : 0;
}

/** Whether a tool is offered to the agent at all: tools it may never call are not listed. */
export function listed(policy: ToolPolicy, tool: string): boolean {
	if (policy.agent === "off") return false;
	const capability = capabilityOf(policy, tool);
	if (policy.agent === "read" && !capability?.read) return false;
	return (capability?.rule ?? "ask") !== "never";
}
