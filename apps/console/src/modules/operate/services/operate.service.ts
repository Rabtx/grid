import { runnerCall } from "@/lib/runner-client";
import { placementsStore } from "@/modules/environments";

import type {
	OperateOverview,
	LogSources,
	LogTail,
	OperateCostsOverview,
	HostingCharge,
	HostingChargeInput,
} from "../types/operate.types";

function base(project: string): string {
	return `${placementsStore.scopeOf(project)}/operate/${encodeURIComponent(project)}`;
}

export const operateService = {
	logs: (token: string, project: string) => runnerCall<LogSources>(`${base(project)}/logs`, token),
	tail: (token: string, project: string, name: string) =>
		runnerCall<LogTail>(`${base(project)}/logs/${encodeURIComponent(name)}`, token),
	saveLog: (token: string, project: string, name: string, path: string) =>
		runnerCall<void>(`${base(project)}/logs/${encodeURIComponent(name)}`, token, {
			method: "PUT",
			body: JSON.stringify({ path }),
		}),
	removeLog: (token: string, project: string, name: string) =>
		runnerCall<void>(`${base(project)}/logs/${encodeURIComponent(name)}`, token, {
			method: "DELETE",
		}),
	costs: (token: string, project: string) =>
		runnerCall<OperateCostsOverview>(`${base(project)}/costs`, token),
	recordCharge: (token: string, project: string, charge: HostingChargeInput) =>
		runnerCall<HostingCharge>(`${base(project)}/costs/charges`, token, {
			method: "POST",
			body: JSON.stringify(charge),
		}),
	removeCharge: (token: string, project: string, id: string) =>
		runnerCall<void>(`${base(project)}/costs/charges/${encodeURIComponent(id)}`, token, {
			method: "DELETE",
		}),
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
