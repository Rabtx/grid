import type { Choice } from "../types/chat.types";

/** The choice with this id, or null when the list no longer carries it. */
export function findChoice(
	choices: readonly Choice[],
	id: string | null | undefined,
): Choice | null {
	if (!id) return null;
	return choices.find((choice) => choice.id === id) ?? null;
}

/**
 * How a mode is drawn beside its name: a guarded mode locks, an editing one carries a pencil,
 * a planning one a compass, an unrestricted one an open lock. Modes the agents report that we
 * have no glyph for are still permission modes, so they keep the lock.
 */
export type ModeGlyph = "lock" | "edit" | "plan" | "open";

const MODE_GLYPHS: Record<string, ModeGlyph> = {
	default: "lock",
	ask: "lock",
	supervised: "lock",
	acceptEdits: "edit",
	"accept-edits": "edit",
	plan: "plan",
	bypassPermissions: "open",
	"full-access": "open",
};

export function modeGlyph(mode: Choice | null | undefined): ModeGlyph {
	return (mode && MODE_GLYPHS[mode.id]) || "lock";
}

/**
 * The one line under a mode's name: the agent's own words when it sent any, else a short line
 * for the modes the agents we drive expose, else none.
 */
const MODE_LINES: Record<string, string> = {
	default: "Ask before commands and file changes",
	ask: "Ask before commands and file changes",
	supervised: "Ask before commands and file changes",
	acceptEdits: "Auto-approve edits; ask before other actions",
	"accept-edits": "Auto-approve edits; ask before other actions",
	plan: "Read and plan; change nothing",
	bypassPermissions: "Allow commands and edits without asking",
	"full-access": "Allow commands and edits without asking",
};

export function modeDescription(mode: Choice): string | null {
	return mode.description || MODE_LINES[mode.id] || null;
}

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

/**
 * A model's name for the composer chip: the agent's "Default · " prefix and any trailing
 * detail in brackets are dropped, so "Default · Opus 5.5 (1M context)" reads "Opus 5.5". The
 * picker itself shows the full name.
 */
export function shortModelName(name: string): string {
	const short = name
		.replace(/^[^·]*·\s*/, "")
		.replace(/\s*\([^)]*\)\s*$/, "")
		.trim();
	return short || name;
}
