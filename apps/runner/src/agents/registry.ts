import { acpProvider } from "./acp";
import { antigravityProvider } from "./antigravity";
import { claudeProvider } from "./claude";
import { opencodeCatalog } from "./opencode";
import type { Provider } from "./provider";

/** Found on PATH now; checked each time so installing an agent needs no runner restart. */
function installed(binary: string): () => boolean {
	return () => Bun.which(binary) !== null;
}

type ExtraAcpAgent = { id: string; name: string; command: string[] };

/**
 * Extra ACP agents from `RUNNER_ACP_AGENTS`, a JSON list such as
 * `[{"id":"gemini","name":"Gemini","command":["gemini","--experimental-acp"]}]` — any agent
 * that speaks ACP works without code.
 */
function extraAgents(raw: string | undefined): ExtraAcpAgent[] {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(agent): agent is ExtraAcpAgent =>
				typeof agent?.id === "string" &&
				typeof agent?.name === "string" &&
				Array.isArray(agent?.command) &&
				agent.command.every((part: unknown) => typeof part === "string"),
		);
	} catch {
		console.error("[runner] RUNNER_ACP_AGENTS is not valid JSON; ignoring it");
		return [];
	}
}

/** Every agent the runner knows how to drive, keyed by id. */
export function providerRegistry(
	env: Record<string, string | undefined> = process.env,
): Map<string, Provider> {
	const providers = new Map<string, Provider>();
	providers.set("claude", claudeProvider({ binary: "claude", available: installed("claude") }));
	providers.set(
		"opencode",
		acpProvider({
			id: "opencode",
			name: "opencode",
			command: ["opencode", "acp"],
			available: installed("opencode"),
			catalog: opencodeCatalog,
		}),
	);
	providers.set("antigravity", antigravityProvider({ binary: "agy", available: installed("agy") }));
	for (const agent of extraAgents(env.RUNNER_ACP_AGENTS)) {
		providers.set(agent.id, acpProvider({ ...agent, available: installed(agent.command[0]) }));
	}
	return providers;
}
