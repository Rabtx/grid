import { runnerCall } from "@/lib/runner-client";

import type { CardInput, TeammateLesson, TeammateRun, TeammateStats } from "../types/team.types";

const post = (body: unknown = {}): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

/**
 * Teammates at work, on a machine's runner (`scope` is its path prefix, "" for this one): cards
 * given to them and where each stands, their scorecards, and what they have learned.
 */
export const teamService = {
	runs: (
		token: string,
		filter: { project?: string; task?: number; teammate?: string } = {},
		scope = "",
	) => {
		const query = new URLSearchParams();
		if (filter.project) query.set("project", filter.project);
		if (filter.task) query.set("task", String(filter.task));
		if (filter.teammate) query.set("teammate", filter.teammate);
		const text = query.toString();
		return runnerCall<TeammateRun[]>(`${scope}/teammates/runs${text ? `?${text}` : ""}`, token);
	},
	stats: (token: string, scope = "") =>
		runnerCall<TeammateStats[]>(`${scope}/teammates/stats`, token),
	/** Gives a card to a teammate: it starts now, or waits behind its other cards. */
	start: (token: string, teammate: string, project: string, task: CardInput, scope = "") =>
		runnerCall<TeammateRun>(`${scope}/teammates/${teammate}/work`, token, post({ project, task })),
	approve: (token: string, run: string, note?: string, scope = "") =>
		runnerCall<TeammateRun>(`${scope}/teammates/runs/${run}/approve`, token, post({ note })),
	stop: (token: string, run: string, scope = "") =>
		runnerCall<TeammateRun>(`${scope}/teammates/runs/${run}/stop`, token, post()),
	retry: (token: string, run: string, scope = "") =>
		runnerCall<TeammateRun>(`${scope}/teammates/runs/${run}/retry`, token, post()),
	lessons: (token: string, teammate: string, scope = "") =>
		runnerCall<TeammateLesson[]>(`${scope}/teammates/${teammate}/lessons`, token),
	proposed: (token: string, scope = "") =>
		runnerCall<TeammateLesson[]>(`${scope}/teammates/lessons/proposed`, token),
	teach: (token: string, teammate: string, text: string, scope = "") =>
		runnerCall<TeammateLesson>(`${scope}/teammates/${teammate}/lessons`, token, post({ text })),
	keep: (token: string, lesson: string, text?: string, scope = "") =>
		runnerCall<TeammateLesson>(`${scope}/teammates/lessons/${lesson}`, token, {
			method: "PATCH",
			body: JSON.stringify({ state: "kept", ...(text ? { text } : {}) }),
		}),
	forget: (token: string, lesson: string, scope = "") =>
		runnerCall<void>(`${scope}/teammates/lessons/${lesson}`, token, { method: "DELETE" }),
};
