import { runnerCall } from "@/lib/runner-client";
import { placementsStore } from "@/modules/environments";

import type { OperateOverview } from "../types/operate.types";

function base(project: string): string {
	return `${placementsStore.scopeOf(project)}/operate/${encodeURIComponent(project)}`;
}

export const operateService = {
	overview: (token: string, project: string) => runnerCall<OperateOverview>(base(project), token),
	save: (token: string, project: string, name: string, url: string) =>
		runnerCall<void>(`${base(project)}/services/${encodeURIComponent(name)}`, token, {
			method: "PUT",
			body: JSON.stringify({ url }),
		}),
	remove: (token: string, project: string, name: string) =>
		runnerCall<void>(`${base(project)}/services/${encodeURIComponent(name)}`, token, {
			method: "DELETE",
		}),
};
