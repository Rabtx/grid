import { createSignal } from "solid-js";

import { type Environment, environmentsService } from "../services/environments.service";

// One list for the whole console: settings and the terminal's "open on…" read the same copy.
const [environments, setEnvironments] = createSignal<Environment[]>([]);
const [environmentsError, setEnvironmentsError] = createSignal<string | null>(null);

export const environmentsStore = {
	environments,
	error: environmentsError,
	async load(token: string): Promise<void> {
		try {
			setEnvironments(await environmentsService.list(token));
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
