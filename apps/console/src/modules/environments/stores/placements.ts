import { createSignal, untrack } from "solid-js";

import { runnerCall } from "@/lib/runner-client";

/**
 * Which machine each project runs on: the environment holding its folder, by project slug, or
 * none for this machine. Every call about a project (its chats, agents, files, folder) goes to
 * that machine's runner through `scopeOf`, so a project on a Codespace simply works there.
 */
const [placements, setPlacements] = createSignal<Record<string, string>>({});
let loading: Promise<void> | null = null;

/** The runner path prefix for calls on an environment; empty for this machine. */
export function scopeFor(environment: string | null | undefined): string {
	return environment ? `/env/${encodeURIComponent(environment)}` : "";
}

export const placementsStore = {
	placements,
	environmentOf: (project: string | null | undefined): string | null =>
		project ? (placements()[project] ?? null) : null,
	/** Prefix for runner calls about this project. */
	scopeOf: (project: string | null | undefined): string =>
		scopeFor(project ? untrack(placements)[project] : null),
	/** Every machine some project runs on, this one first (as ""). */
	scopes: (): string[] => ["", ...new Set(Object.values(placements()).map(scopeFor))],
	/** Read the placements, once per visit (later calls share the first). */
	load(token: string): Promise<void> {
		loading ??= runnerCall<Record<string, string>>("/environments/placements", token).then(
			(next) => {
				setPlacements(next ?? {});
			},
			() => {
				// The runner is down: keep what we had; calls go to this machine meanwhile.
				loading = null;
			},
		);
		return loading;
	},
	/** Re-read after pairing or removing an environment. */
	reload(token: string): Promise<void> {
		loading = null;
		return placementsStore.load(token);
	},
	/** Run a project on an environment, or (null) on this machine. */
	async place(token: string, project: string, environment: string | null): Promise<void> {
		await runnerCall<void>(`/environments/placements/${encodeURIComponent(project)}`, token, {
			method: "PUT",
			body: JSON.stringify({ environment }),
		});
		const next = { ...untrack(placements) };
		if (environment) next[project] = environment;
		else delete next[project];
		setPlacements(next);
	},
};
