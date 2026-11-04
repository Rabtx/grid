import { createSignal, untrack } from "solid-js";

import { teamService } from "../services/team.service";
import type { TeammateRun } from "../types/team.types";

/** Each project's cards' latest teammate run, by card number, as the board last read them. */
const [byProject, setByProject] = createSignal<Record<string, Record<number, TeammateRun>>>({});

/**
 * What teammates are doing on a board's cards, so each card can say it ("Riley · Plan ready").
 * The board reads it again every few seconds while it is open.
 */
export const cardRunsStore = {
	latest: (project: string, number: number): TeammateRun | null =>
		byProject()[project]?.[number] ?? null,
	async read(token: string, project: string, scope = ""): Promise<void> {
		const runs = await teamService.runs(token, { project }, scope).catch(() => null);
		if (!runs) return;
		// Newest first from the runner: the first one seen for a card is its latest.
		const latest: Record<number, TeammateRun> = {};
		for (const run of runs) latest[run.taskNumber] ??= run;
		setByProject({ ...untrack(byProject), [project]: latest });
	},
};
