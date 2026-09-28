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

/**
 * What a picker row says under a model's name: the agent's description without the model id it
 * often starts with ("claude-opus-5-5 · Best for everyday tasks" reads "Best for everyday
 * tasks"). The id stays in the row's tooltip.
 */
export function modelBlurb(choice: Choice): string | undefined {
	const text = choice.description?.trim();
	if (!text) return undefined;
	const rest = text.replace(/^[a-z0-9][\w.:/-]*[-\d][\w.:/-]*\s*·\s*/i, "").trim();
	return rest || undefined;
}

/**
 * An agent's "Default" model and the model it currently resolves to are one choice: the list
 * keeps the default (under the model's own name, marked as the default) and drops the duplicate.
 * `aliases` maps the default's id to the id it stands for, so either reads as chosen.
 */
export function foldDefault(choices: readonly Choice[]): {
	choices: Choice[];
	defaults: Set<string>;
	aliases: Map<string, string>;
} {
	const defaults = new Set<string>();
	const aliases = new Map<string, string>();
	const hidden = new Set<string>();
	const named = choices.map((choice) => {
		const match = /^Default\s*·\s*(.+)$/.exec(choice.name);
		if (!match) return choice;
		defaults.add(choice.id);
		const target = choices.find((other) => other !== choice && other.name === match[1]);
		if (target) {
			aliases.set(choice.id, target.id);
			hidden.add(target.id);
		}
		return { ...choice, name: match[1] };
	});
	return { choices: named.filter((choice) => !hidden.has(choice.id)), defaults, aliases };
}
