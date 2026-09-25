import { createSignal } from "solid-js";

import { localStore } from "@/lib/local-store";

import { type Environment, environmentsService } from "../services/environments.service";

// One list for the whole console: settings and the terminal's "open on…" read the same copy.
const [environments, setEnvironments] = createSignal<Environment[]>([]);
const [environmentsError, setEnvironmentsError] = createSignal<string | null>(null);

export const environmentsStore = {
	environments,
	error: environmentsError,
	/** What this device kept shows first; the runner's answer replaces it. */
	async load(token: string): Promise<void> {
		if (environments().length === 0) {
			const kept = await localStore.get<Environment[]>("environments");
			if (kept?.length && environments().length === 0) setEnvironments(kept);
		}
		try {
			const list = await environmentsService.list(token);
			setEnvironments(list);
			void localStore.set("environments", list);
			setEnvironmentsError(null);
		} catch (cause) {
			setEnvironmentsError(cause instanceof Error ? cause.message : "Could not reach the runner");
		}
	},
	async add(token: string, input: { url: string; code: string; label: string }): Promise<void> {
		const added = await environmentsService.add(token, input);
		setEnvironments((list) => [...list, added]);
	},
	async remove(token: string, id: string): Promise<void> {
		await environmentsService.remove(token, id);
		setEnvironments((list) => list.filter((environment) => environment.id !== id));
	},
	labelOf(id: string | null | undefined): string | null {
		if (!id) return null;
		return environments().find((environment) => environment.id === id)?.label ?? null;
	},
};
