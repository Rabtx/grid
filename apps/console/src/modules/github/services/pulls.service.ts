import { runnerCall } from "@/lib/runner-client";
import type { FileDiff } from "@/modules/chat/types/chat.types";
import { placementsStore } from "@/modules/environments/stores/placements";

import type {
	FixInclude,
	FixPlan,
	DraftComment,
	MergeMethod,
	PullAction,
	PullDetail,
	PullFilter,
	PullHistory,
	PullReview,
	PullState,
	PullSummary,
	ReviewEvent,
} from "../types/github.types";

/** A project's pull requests, through GitHub on whichever machine the project runs. */
function base(project: string): string {
	return `${placementsStore.scopeOf(project)}/github/pulls/${project}`;
}

export const pullsService = {
	list: (token: string, project: string, filter: PullFilter, state: PullState = "open") =>
		runnerCall<PullSummary[]>(`${base(project)}?filter=${filter}&state=${state}`, token),
	/** Its commits on its base: ahead, behind, where it left it. */
	history: (token: string, project: string, number: number) =>
		runnerCall<PullHistory>(`${base(project)}/${number}/history`, token),
	/** Its review threads, viewed files and verdicts. */
	review: (token: string, project: string, number: number) =>
		runnerCall<PullReview>(`${base(project)}/${number}/review`, token),
	setViewed: (token: string, project: string, number: number, path: string, viewed: boolean) =>
		runnerCall<void>(`${base(project)}/${number}/viewed`, token, {
			method: "POST",
			body: JSON.stringify({ path, viewed }),
		}),
	rebase: (token: string, project: string, number: number) =>
		runnerCall<void>(`${base(project)}/${number}/rebase`, token, { method: "POST" }),
	submitReview: (
		token: string,
		project: string,
		number: number,
		review: { event: ReviewEvent; body: string; comments: readonly DraftComment[] },
	) =>
		runnerCall<void>(`${base(project)}/${number}/review`, token, {
			method: "POST",
			body: JSON.stringify({
				event: review.event,
				body: review.body,
				comments: review.comments.map(({ path, line, side, body }) => ({ path, line, side, body })),
			}),
		}),
	view: (token: string, project: string, number: number) =>
		runnerCall<PullDetail>(`${base(project)}/${number}`, token),
	diff: (token: string, project: string, number: number) =>
		runnerCall<FileDiff[]>(`${base(project)}/${number}/diff`, token),
	merge: (
		token: string,
		project: string,
		number: number,
		method: MergeMethod,
		deleteBranch = false,
	) =>
		runnerCall<void>(`${base(project)}/${number}/merge`, token, {
			method: "POST",
			body: JSON.stringify({ method, deleteBranch }),
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
