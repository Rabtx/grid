import { createSignal } from "solid-js";

/**
 * Starred models, kept on this device: a per-person convenience for the model picker, like a
 * remembered tab, not an account setting. Keyed `agent:model`, since two agents can offer the
 * same model id.
 */
const KEY = "grid.models.favorites";

function read(): string[] {
	try {
		const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
		return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string") : [];
	} catch {
		return [];
	}
}

const [favorites, setFavorites] = createSignal<readonly string[]>(read());

function keyOf(agent: string, model: string): string {
	return `${agent}:${model}`;
}

export const favoritesStore = {
	all: favorites,
	has: (agent: string, model: string): boolean => favorites().includes(keyOf(agent, model)),
	toggle(agent: string, model: string): void {
		const key = keyOf(agent, model);
		const next = favorites().includes(key)
			? favorites().filter((item) => item !== key)
			: [...favorites(), key];
		setFavorites(next);
		try {
			localStorage.setItem(KEY, JSON.stringify(next));
		} catch {
			// Not remembered on this device this time; the star still shows for now.
		}
	},
};
