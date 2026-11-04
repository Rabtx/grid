import type { Who } from "../auth";
import { costSoFar, runOutcome } from "../automations/outcome";
import type { ChatHub } from "../chat/hub";
import type { InboxDraft } from "../inbox/store";
import type { Role, RoleStore } from "../roles/store";
import { OPEN_STATES, type TeammateRun, type TeammateStore } from "./store";

/** A card as the board has it, to give a teammate. */
export type CardInput = { number: number; key: string; title: string; description: string };

/** Moves a card on the board as a person (the runner's key, acting as them). Best effort. */
export type BoardMove = (
	ownerId: string,
	workspace: string,
	project: string,
	number: number,
	status: "in_progress" | "review",
) => Promise<void>;

export type TeammateWorkDeps = {
	chat: Pick<
		ChatHub,
		"createAutomation" | "prompt" | "turnOutcome" | "cancel" | "rename" | "events"
	>;
	roles: Pick<RoleStore, "get" | "list">;
	store: TeammateStore;
	inbox: { keep: (item: InboxDraft) => void };
	board?: BoardMove;
};

/** How one teammate has done, for its scorecard. */
export type TeammateStats = {
	teammateId: string;
	/** Cards on now (planning, a plan waiting, or working) and waiting their turn. */
	active: number;
	queued: number;
	/** Cards it finished (handed to review or the next teammate), got stuck on, or was stopped on. */
	finished: number;
	stuck: number;
	stopped: number;
	/** Of the cards that ended: the share finished. Null before any ended. */
	successRate: number | null;
	/** How long a finished card took, start to review, in minutes; null before one. */
	medianMinutes: number | null;
	/** What its threads cost so far, where the agent says. */
	costUsd: number;
	lessons: number;
};

export class TeammateError extends Error {
	constructor(
		message: string,
		readonly status = 409,
	) {
		super(message);
	}
}

const describe = (run: Pick<TeammateRun, "taskKey" | "taskTitle">) =>
	`${run.taskKey}: ${run.taskTitle}`;

/** The card as the teammate is given it. */
function cardText(run: TeammateRun): string {
	const body = run.taskBody.trim();
	return `Board card ${describe(run)}${body ? `\n\n${body}` : ""}`;
}

const WHERE = (run: TeammateRun) =>
	run.branch
		? `You work in your own git worktree, on branch ${run.branch}.`
		: "You work in the project's folder.";

const FINISH =
	"When it is done: commit your work on this branch with a clear message, push the branch and open a pull request if you can (gh pr create), then end with a short summary of what you changed and how you checked it.";

/** The first message of a card that waits for an approved plan. */
export function planPrompt(run: TeammateRun): string {
	return [
		cardText(run),
		WHERE(run),
		"First write your plan: what you will change and how you will check it, as a short numbered list. Do not change any files yet. A person approves the plan before you start.",
	].join("\n\n");
}

/** The message that starts the work: the card itself, or the approval of its plan. */
export function workPrompt(run: TeammateRun, approved: boolean, note?: string): string {
	if (approved)
		return [
			`Your plan is approved.${note?.trim() ? ` A note from the team: ${note.trim()}` : ""}`,
			"Do the card now.",
			FINISH,
		].join("\n\n");
	return [cardText(run), WHERE(run), FINISH].join("\n\n");
}

/** What a teammate is given when a card is handed on to it from another. */
function handoffBody(from: TeammateRun, name: string): string {
	return [
		from.taskBody.trim(),
		`${name} finished this card${from.branch ? ` on branch ${from.branch}` : ""}. Review that work against the card: read the changes, run the checks, fix what is wrong, and say what you found.`,
	]
		.filter(Boolean)
		.join("\n\n");
}

/**
 * Teammates working on cards. Assigning a card to a teammate (or pressing Start) makes a run: a
 * thread in a worktree of its own, titled with the card's key so the card shows it, acting on the
 * board as the person who gave it. A teammate works on `parallel` cards at once; the rest queue.
 *
 * With `planFirst`, it writes a plan and waits (plan_ready) until a person approves it. When a
 * card is done it moves to review, or to the next teammate (`handoffTo`) as a run of its own on the
 * same branch. A failed turn leaves the run needing a person, who can retry it or stop it.
 */
export class TeammateWork {
	/** Runs whose turn is under way in this process: a second turn on one is refused. */
	private readonly busy = new Set<string>();

	constructor(private readonly deps: TeammateWorkDeps) {}

	/** Runs left mid-turn by a restart: their turns are gone, so they wait for a person. */
	recover(): void {
		for (const run of this.deps.store.interrupted())
			this.deps.store.updateRun(run.id, {
				state: "needs_you",
				error: "Grid restarted while this was under way: retry to carry on",
			});
	}

	/** Gives a card to a teammate: it starts now, or waits its turn behind the teammate's others. */
	start(who: Who, teammateId: string, project: string, card: CardInput): TeammateRun {
		const role = this.deps.roles.get(who.workspace, teammateId);
		if (!role) throw new TeammateError("That teammate is not on this team", 404);
		const open = this.deps.store
			.runs(who.workspace, { teammateId, project, taskNumber: card.number })
			.find((run) => (OPEN_STATES as readonly string[]).includes(run.state));
		if (open) return open;
		const run = this.deps.store.createRun({
			workspaceId: who.workspace,
			teammateId,
			project,
			taskNumber: card.number,
			taskKey: card.key,
			taskTitle: card.title,
			taskBody: card.description,
			ownerId: who.userId,
			sessionId: null,
			state: "queued",
			fromRun: null,
		});
		this.pump(who.workspace, teammateId);
		return run;
	}

	/** Approves a run's plan: it goes on to do the card, with the person's note if they left one. */
	approve(workspace: string, runId: string, note?: string): TeammateRun {
		const run = this.owned(workspace, runId);
		if (run.state !== "plan_ready" || !run.sessionId)
			throw new TeammateError("There is no plan waiting on this card");
		const next = this.deps.store.updateRun(run.id, { state: "working", error: null }) ?? run;
		void this.turn(next, workPrompt(next, true, note));
		return next;
	}

	/** Stops a run where it is; the card stays with the teammate until someone gives it again. */
	stop(workspace: string, runId: string): TeammateRun {
		const run = this.owned(workspace, runId);
		if (run.sessionId && this.busy.has(run.id)) this.deps.chat.cancel(workspace, run.sessionId);
		const next = this.deps.store.updateRun(run.id, { state: "stopped" }) ?? run;
		this.pump(workspace, run.teammateId);
		return next;
	}

	/** Tries a stuck or stopped run again: in its own thread when it has one, else from the start. */
	retry(workspace: string, runId: string): TeammateRun {
		const run = this.owned(workspace, runId);
		if (run.state !== "needs_you" && run.state !== "stopped")
			throw new TeammateError("This card is not stuck");
		if (!run.sessionId) {
			const queued = this.deps.store.updateRun(run.id, { state: "queued", error: null }) ?? run;
			this.pump(workspace, run.teammateId);
			return queued;
		}
		const next = this.deps.store.updateRun(run.id, { state: "working", error: null }) ?? run;
		void this.turn(next, `Carry on with ${describe(run)} where you stopped. ${FINISH}`);
		return next;
	}

	runs(workspace: string, filter: Parameters<TeammateStore["runs"]>[1] = {}): TeammateRun[] {
		return this.deps.store.runs(workspace, filter);
	}

	/** Each teammate's scorecard, from its last 200 runs. */
	stats(workspace: string): TeammateStats[] {
		return this.deps.roles.list(workspace).map((role) => {
			const runs = this.deps.store.runs(workspace, { teammateId: role.id, limit: 200 });
			const count = (...states: string[]) =>
				runs.filter((run) => states.includes(run.state)).length;
			const finished = runs.filter((run) => run.state === "review");
			const ended = finished.length + count("needs_you");
			const minutes = finished
				.filter((run) => run.endedAt)
				.map((run) => (Date.parse(run.endedAt ?? "") - Date.parse(run.createdAt)) / 60_000)
				.sort((a, b) => a - b);
			let costUsd = 0;
			for (const run of runs)
				if (run.sessionId) {
					try {
						costUsd += costSoFar(this.deps.chat.events(workspace, run.sessionId));
					} catch {
						// The thread was removed; its cost went with it.
					}
				}
			return {
				teammateId: role.id,
				active: count("planning", "plan_ready", "working"),
				queued: count("queued"),
				finished: finished.length,
				stuck: count("needs_you"),
				stopped: count("stopped"),
				successRate: ended ? finished.length / ended : null,
				medianMinutes: minutes.length
					? Math.round(minutes[Math.floor((minutes.length - 1) / 2)] ?? 0)
					: null,
				costUsd: Math.round(costUsd * 100) / 100,
				lessons: this.deps.store.lessons(workspace, role.id).filter((item) => item.state === "kept")
					.length,
			};
		});
	}

	private owned(workspace: string, runId: string): TeammateRun {
		const run = this.deps.store.run(runId);
		if (!run || run.workspaceId !== workspace)
			throw new TeammateError("That card run is not here", 404);
		return run;
	}

	/** Starts a teammate's queued runs, oldest first, while it has room for them. */
	private pump(workspace: string, teammateId: string): void {
		const role = this.deps.roles.get(workspace, teammateId);
		if (!role) return;
		const runs = this.deps.store.runs(workspace, { teammateId, limit: 500 });
		let busy = runs.filter((run) => run.state === "planning" || run.state === "working").length;
		const queued = runs.filter((run) => run.state === "queued").reverse();
		for (const run of queued) {
			if (busy >= role.parallel) break;
			busy++;
			// Marked before it is launched, so a second pump does not launch it again.
			const marked = this.deps.store.updateRun(run.id, {
				state: role.planFirst ? "planning" : "working",
			});
			if (marked) void this.launch(marked, role);
		}
	}

	/** A run's thread, in a worktree of its own (from the branch it was handed on from, if any). */
	private async launch(run: TeammateRun, role: Role): Promise<void> {
		const workspace = run.workspaceId;
		let current = run;
		try {
			const from = run.fromRun ? this.deps.store.run(run.fromRun) : null;
			const session = await this.deps.chat.createAutomation(
				{ userId: run.ownerId, workspace },
				{
					project: run.project,
					provider: role.provider,
					model: role.model ?? undefined,
					effort: role.effort ?? undefined,
					mode: role.mode ?? undefined,
					worktree: true,
					base: from?.branch ?? undefined,
					role: { id: role.id, name: role.name, icon: role.icon, brief: role.brief },
				},
			);
			this.deps.chat.rename(workspace, session.id, describe(run));
			current =
				this.deps.store.updateRun(run.id, {
					sessionId: session.id,
					branch: session.worktree?.branch ?? null,
				}) ?? run;
			void this.deps
				.board?.(run.ownerId, workspace, run.project, run.taskNumber, "in_progress")
				.catch(() => undefined);
			await this.turn(
				current,
				current.state === "planning" ? planPrompt(current) : workPrompt(current, false),
			);
		} catch (cause) {
			this.stuck(current, cause instanceof Error ? cause.message : String(cause));
		}
	}

	/** One turn of a run: the message, then what its end means for the card. */
	private async turn(run: TeammateRun, text: string): Promise<void> {
		if (!run.sessionId) return;
		if (this.busy.has(run.id)) return;
		this.busy.add(run.id);
		const workspace = run.workspaceId;
		try {
			await this.deps.chat.prompt(workspace, run.sessionId, text);
			const now = this.deps.store.run(run.id);
			// Stopped while it worked: that is where it stays.
			if (!now || now.state === "stopped") return;
			const outcome = this.deps.chat.turnOutcome(workspace, run.sessionId);
			if (!outcome || outcome.reason !== "done") {
				this.stuck(now, outcome?.error ?? "The agent's turn did not finish");
				return;
			}
			if (now.state === "planning") {
				this.deps.store.updateRun(run.id, { state: "plan_ready" });
				this.tell(now, "plan", "Its plan is ready for you to approve");
				return;
			}
			this.finished(now);
		} catch (cause) {
			const now = this.deps.store.run(run.id) ?? run;
			if (now.state !== "stopped")
				this.stuck(now, cause instanceof Error ? cause.message : String(cause));
		} finally {
			this.busy.delete(run.id);
			this.pump(workspace, run.teammateId);
		}
	}

	/** A card done: to review, and on to the next teammate when this one hands its cards on. */
	private finished(run: TeammateRun): void {
		this.deps.store.updateRun(run.id, { state: "review" });
		const role = this.deps.roles.get(run.workspaceId, run.teammateId);
		const next = role?.handoffTo ? this.deps.roles.get(run.workspaceId, role.handoffTo) : null;
		if (role && next) {
			const relay = this.deps.store.createRun({
				workspaceId: run.workspaceId,
				teammateId: next.id,
				project: run.project,
				taskNumber: run.taskNumber,
				taskKey: run.taskKey,
				taskTitle: run.taskTitle,
				taskBody: handoffBody(run, role.name),
				ownerId: run.ownerId,
				sessionId: null,
				state: "queued",
				fromRun: run.id,
			});
			this.tell(run, "done", `Done, and handed to ${next.name}`);
			this.pump(run.workspaceId, relay.teammateId);
			return;
		}
		void this.deps
			.board?.(run.ownerId, run.workspaceId, run.project, run.taskNumber, "review")
			.catch(() => undefined);
		const outcome = run.sessionId
			? runOutcome(this.deps.chat.events(run.workspaceId, run.sessionId))
			: null;
		this.tell(run, "done", outcome?.summary?.slice(0, 160) || "Done: ready for review");
	}

	private stuck(run: TeammateRun, error: string): void {
		this.deps.store.updateRun(run.id, { state: "needs_you", error });
		this.tell(run, "stuck", error);
	}

	/** Puts the card in the Inbox of the person who gave it. */
	private tell(run: TeammateRun, what: "plan" | "done" | "stuck", body: string): void {
		const name = this.deps.roles.get(run.workspaceId, run.teammateId)?.name ?? "A teammate";
		this.deps.inbox.keep({
			id: `teammate:${run.id}:${what}`,
			workspaceId: run.workspaceId,
			ownerId: run.ownerId,
			kind: what === "stuck" ? "turn_error" : "teammate",
			project: run.project,
			title: `${name} · ${describe(run)}`,
			body,
			url: `/board/${run.project}/tasks/${run.taskNumber}`,
			createdAt: new Date().toISOString(),
		});
	}
}
