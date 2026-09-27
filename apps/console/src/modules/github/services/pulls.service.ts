import { runnerCall } from "@/lib/runner-client";
import type { FileDiff } from "@/modules/chat/types/chat.types";
import { placementsStore } from "@/modules/environments/stores/placements";

import type {
	FixInclude,
	FixPlan,
	MergeMethod,
	PullAction,
	PullDetail,
	PullFilter,
	PullSummary,
} from "../types/github.types";

/** A project's pull requests, through GitHub on whichever machine the project runs. */
function base(project: string): string {
	return `${placementsStore.scopeOf(project)}/github/pulls/${project}`;
}

export const pullsService = {
	list: (token: string, project: string, filter: PullFilter) =>
		runnerCall<PullSummary[]>(`${base(project)}?filter=${filter}`, token),
	view: (token: string, project: string, number: number) =>
		runnerCall<PullDetail>(`${base(project)}/${number}`, token),
	diff: (token: string, project: string, number: number) =>
		runnerCall<FileDiff[]>(`${base(project)}/${number}/diff`, token),
	merge: (token: string, project: string, number: number, method: MergeMethod) =>
		runnerCall<void>(`${base(project)}/${number}/merge`, token, {
			method: "POST",
			body: JSON.stringify({ method }),
		}),
	act: (token: string, project: string, number: number, action: PullAction) =>
		runnerCall<void>(`${base(project)}/${number}/${action}`, token, { method: "POST" }),
	comment: (token: string, project: string, number: number, body: string) =>
		runnerCall<void>(`${base(project)}/${number}/comment`, token, {
			method: "POST",
			body: JSON.stringify({ body }),
		}),
	/** The branch and first message a fix thread on this pull request would start with. */
	fix: (token: string, project: string, number: number, include: FixInclude) =>
		runnerCall<FixPlan>(`${base(project)}/${number}/fix`, token, {
			method: "POST",
			body: JSON.stringify({ include }),
		}),
};
