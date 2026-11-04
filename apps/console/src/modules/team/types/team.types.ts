/** Where a card a teammate took stands (see the runner's `teammates/store.ts`). */
export type RunState =
	| "queued"
	| "planning"
	| "plan_ready"
	| "working"
	| "review"
	| "needs_you"
	| "stopped";

/** One card a teammate took on. */
export type TeammateRun = {
	id: string;
	teammateId: string;
	project: string;
	taskNumber: number;
	taskKey: string;
	taskTitle: string;
	ownerId: string;
	sessionId: string | null;
	state: RunState;
	branch: string | null;
	fromRun: string | null;
	error: string | null;
	createdAt: string;
	updatedAt: string;
	endedAt: string | null;
};

/** A teammate's scorecard. */
export type TeammateStats = {
	teammateId: string;
	active: number;
	queued: number;
	finished: number;
	stuck: number;
	stopped: number;
	successRate: number | null;
	medianMinutes: number | null;
	costUsd: number;
	lessons: number;
};

/** Something a teammate learned, or proposes to. */
export type TeammateLesson = {
	id: string;
	teammateId: string;
	text: string;
	state: "proposed" | "kept";
	sessionId: string | null;
	createdAt: string;
};

/** A card to give a teammate. */
export type CardInput = { number: number; key: string; title: string; description: string };
