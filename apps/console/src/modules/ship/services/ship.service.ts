import { runnerCall } from "@/lib/runner-client";
import { placementsStore } from "@/modules/environments/stores/placements";

import type {
	EnvironmentDetail,
	EnvironmentSettings,
	PipelineDetail,
	Preview,
	ShipOverview,
} from "../types/ship.types";

/** A project's Ship, through GitHub on whichever machine the project runs. */
function base(project: string): string {
	return `${placementsStore.scopeOf(project)}/ship/${project}`;
}

const env = (project: string, name: string) => `${base(project)}/env/${encodeURIComponent(name)}`;

export const shipService = {
	overview: (token: string, project: string) => runnerCall<ShipOverview>(base(project), token),
	environment: (token: string, project: string, name: string) =>
		runnerCall<EnvironmentDetail>(env(project, name), token),
	promote: (token: string, project: string, name: string, watch: boolean) =>
		runnerCall<{ version: string }>(`${env(project, name)}/promote`, token, {
			method: "POST",
			body: JSON.stringify({ watch }),
		}),
	rollback: (token: string, project: string, name: string, id: number) =>
		runnerCall<{ version: string }>(`${env(project, name)}/rollback`, token, {
			method: "POST",
			body: JSON.stringify({ id }),
		}),
	saveSettings: (token: string, project: string, name: string, settings: EnvironmentSettings) =>
		runnerCall<void>(`${env(project, name)}/settings`, token, {
			method: "PUT",
			body: JSON.stringify(settings),
		}),
	previews: (token: string, project: string) =>
		runnerCall<Preview[]>(`${base(project)}/previews`, token),
	pipeline: (token: string, project: string, id: string) =>
		runnerCall<PipelineDetail>(`${base(project)}/pipelines/${id}`, token),
	/** Why the first failing check failed: its log, cut down. */
	failureLog: (token: string, project: string, id: string) =>
		runnerCall<{ check: string; excerpt: string } | null>(
			`${base(project)}/pipelines/${id}/log`,
			token,
		),
	rerun: (token: string, project: string, id: string, which: { failed: boolean; check?: string }) =>
		runnerCall<void>(`${base(project)}/pipelines/${id}/rerun`, token, {
			method: "POST",
			body: JSON.stringify(which),
		}),
	pushFix: (token: string, project: string, number: number) =>
		runnerCall<void>(`${base(project)}/pipelines/${number}/push`, token, { method: "POST" }),
};
