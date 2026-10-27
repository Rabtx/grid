import { runnerCall } from "@/lib/runner-client";
import { placementsStore } from "@/modules/environments/stores/placements";

/** How a project's review agent is set (the runner's `github/reviews.ts`). */
export type ReviewSettings = {
	enabled: boolean;
	provider: string;
	model: string | null;
	instructions: string | null;
	ownerId: string;
	since: string;
	updatedAt: string;
};

/** One review the agent did, or is doing, of a pull request at one commit. */
export type AgentReview = {
	id: string;
	repo: string;
	number: number;
	title: string;
	head: string;
	status: "running" | "posted" | "failed";
	sessionId: string | null;
	commentUrl: string | null;
	error: string | null;
	at: string;
	manual: boolean;
};

export type ProjectReviews = {
	settings: ReviewSettings | null;
	reviews: AgentReview[];
	canManage: boolean;
};

export type ReviewSettingsInput = {
	enabled: boolean;
	provider: string;
	model: string | null;
	instructions: string | null;
};

/** A project's review agent, on the machine the project runs on. */
const base = (project: string) => `${placementsStore.scopeOf(project)}/reviews`;

export const reviewsService = {
	get: (token: string, project: string) =>
		runnerCall<ProjectReviews>(`${base(project)}?project=${encodeURIComponent(project)}`, token),
	save: (token: string, project: string, input: ReviewSettingsInput) =>
		runnerCall<ReviewSettings>(`${base(project)}/settings`, token, {
			method: "PUT",
			body: JSON.stringify({ project, ...input }),
		}),
	/** Review a pull request now; resolves once the review has started. */
	run: (token: string, project: string, number: number) =>
		runnerCall<AgentReview>(`${base(project)}/run`, token, {
			method: "POST",
			body: JSON.stringify({ project, number }),
		}),
};
