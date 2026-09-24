import type { Choice } from "../types/chat.types";

/**
 * Choices matching a search: every word typed must appear in the name, id, group or description,
 * in any order and case — "opus 1m", "free flash", "openrouter claude" all work.
 */
export function filterChoices(choices: readonly Choice[], query: string): Choice[] {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	if (words.length === 0) return [...choices];
	return choices.filter((choice) => {
		const haystack =
			`${choice.name} ${choice.id} ${choice.group ?? ""} ${choice.description ?? ""}`.toLowerCase();
		return words.every((word) => haystack.includes(word));
	});
}

/** Consecutive runs of the same group, for headings; ungrouped choices form one unnamed run. */
export function groupChoices(
	choices: readonly Choice[],
): { group: string | null; choices: Choice[] }[] {
	const groups: { group: string | null; choices: Choice[] }[] = [];
	for (const choice of choices) {
		const group = choice.group ?? null;
		const last = groups.at(-1);
		if (last && last.group === group) last.choices.push(choice);
		else groups.push({ group, choices: [choice] });
	}
	return groups;
}

/**
 * The agent's catalog, plus any model the running agent reported that the catalog lacks, so a
 * short or stale catalog never hides a model.
 */
export function mergeModels(catalog: readonly Choice[], live: readonly Choice[]): Choice[] {
	const known = new Set(catalog.map((model) => model.id));
	return [...catalog, ...live.filter((model) => !known.has(model.id))];
}
