import { cached, effortChoices, runCli } from "./catalog";
import type { Choice } from "./events";

type VerboseModel = {
	id: string;
	providerID: string;
	name?: string;
	status?: string;
	cost?: { input?: number; output?: number };
	limit?: { context?: number };
	variants?: Record<string, unknown>;
};

function contextSize(tokens: number | undefined): string | null {
	if (!tokens) return null;
	return tokens >= 1_000_000
		? `${Math.round(tokens / 100_000) / 10}M context`
		: `${Math.round(tokens / 1000)}K context`;
}

/**
 * opencode's full model list (`opencode models --verbose`: an id line, then that model's JSON)
 * as picker entries: exact names, grouped by provider, free or not, context size, and the model's
 * effort levels ("variants"). Selecting `model/variant` over ACP sets both at once.
 */
export function parseOpencodeModels(text: string): Choice[] {
	const models: Choice[] = [];
	const chunks = text.split(/^(?=[a-z0-9][\w.-]*\/\S+\n\{)/m);
	for (const chunk of chunks) {
		const newline = chunk.indexOf("\n");
		if (newline < 0) continue;
		const id = chunk.slice(0, newline).trim();
		let model: VerboseModel;
		try {
			model = JSON.parse(chunk.slice(newline + 1)) as VerboseModel;
		} catch {
			continue;
		}
		if (model.status === "deprecated") continue;
		const free = model.cost && !model.cost.input && !model.cost.output;
		const levels = Object.keys(model.variants ?? {});
		models.push({
			id,
			name: model.name ?? model.id,
			group: model.providerID,
			description: [id, free ? "free" : null, contextSize(model.limit?.context)]
				.filter(Boolean)
				.join(" · "),
			...(model.limit?.context ? { contextWindow: model.limit.context } : {}),
			...(levels.length
				? {
						efforts: effortChoices(levels),
						defaultEffort: levels.includes("medium") ? "medium" : levels[0],
					}
				: {}),
		});
	}
	return models;
}

/**
 * opencode's plain model list (`opencode models`: one `provider/model` id per line), for
 * opencode 2, which dropped `--verbose`. Only the id is known: grouped by provider, and marked
 * free when the id says so.
 */
export function parseOpencodeModelIds(text: string): Choice[] {
	const models: Choice[] = [];
	for (const line of text.split("\n")) {
		const id = line.trim();
		const slash = id.indexOf("/");
		if (slash <= 0 || /\s/.test(id)) continue;
		const model = id.slice(slash + 1);
		models.push({
			id,
			name: model,
			group: id.slice(0, slash),
			description: [id, /(^|-)free$/.test(model) ? "free" : null].filter(Boolean).join(" · "),
		});
	}
	return models;
}

/** The detailed list where this opencode still offers it, else the plain one. */
async function loadOpencodeModels(): Promise<Choice[]> {
	try {
		return parseOpencodeModels(await runCli(["opencode", "models", "--verbose"], 60_000));
	} catch {
		return parseOpencodeModelIds(await runCli(["opencode", "models"], 60_000));
	}
}

const opencodeModels = cached(10 * 60 * 1000, async () => ({ models: await loadOpencodeModels() }));

export const opencodeCatalog = (fresh?: boolean) => opencodeModels(fresh);
