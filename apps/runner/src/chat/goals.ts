import type { GoalStatus } from "../agents/events";
import type { AutonomyStore, Goal } from "./autonomy-store";
import { ChatError, type ChatHub } from "./hub";
import type { ChatSessionRow } from "./store";

/** Turns a goal may take unless the person says otherwise, and at most. */
export const DEFAULT_GOAL_TURNS = 20;
export const MAX_GOAL_TURNS = 100;
const OBJECTIVE_MAX = 2_000;
const NOTE_MAX = 600;

const MET = /^\W*GOAL MET\b/im;
const BLOCKED = /^\W*GOAL BLOCKED\b/im;

/** What an agent is told with each turn spent on a goal. */
export function goalPrompt(goal: Pick<Goal, "objective" | "turns" | "maxTurns">): string {
	const first = goal.turns === 0;
	return [
		first
			? `[Goal] The person set a goal for this thread: ${goal.objective}`
			: `[Goal] Keep working toward the goal: ${goal.objective}`,
		first
			? `Work toward it across as many turns as it takes (up to ${goal.maxTurns}); Grid sends you the next turn each time one ends.`
			: `This is turn ${goal.turns + 1} of at most ${goal.maxTurns}.`,
		'When the goal is met and you have checked that it is, begin your reply with "GOAL MET" and say how you checked. If you cannot get there without the person, begin with "GOAL BLOCKED" and say what you need.',
	].join("\n");
}

/** How an agent's reply settles a goal: met, blocked, or not yet. */
export function goalVerdict(reply: string): "met" | "blocked" | null {
	if (MET.test(reply)) return "met";
	if (BLOCKED.test(reply)) return "blocked";
	return null;
}

function excerpt(text: string): string {
	// What follows the verdict, without the punctuation that joined it ("GOAL MET. I …").
	const flat = text
		.replace(/\s+/g, " ")
		.trim()
		.replace(/^[\s.,:;!*—–-]+/, "");
	return flat.length > NOTE_MAX ? `${flat.slice(0, NOTE_MAX)}…` : flat;
}

/**
 * A thread's goal (`/goal`): what "done" means, which the agent keeps working toward turn after
 * turn until it says the goal is met (and how it checked), says it is blocked on the person, or
 * runs out of turns. Each turn ending without a verdict sends the next, as a message from Grid
 * that waits behind anything the person queued. A stop by the person pauses the goal; a failed
 * turn leaves it waiting for the next turn to end. Kept in SQLite, so a restart keeps it.
 */
export class Goals {
	constructor(
		private readonly hub: ChatHub,
		private readonly store: AutonomyStore,
	) {
		hub.onTurnEnded((session, reason) => {
			if (reason === "done") this.turnDone(session);
		});
		hub.onStopped((session) => {
			const goal = this.store.goal(session.id);
			if (goal?.status === "active") this.change(goal, "paused", "You stopped the thread.");
		});
		hub.onRemoved((thread) => this.store.forget(thread));
	}

	get(workspace: string, id: string): Goal | null {
		this.hub.thread(workspace, id);
		const goal = this.store.goal(id);
		return goal && goal.status !== "cleared" ? goal : null;
	}

	/** Set a goal, replacing any; work on it starts now, or when the turn going on ends. */
	set(workspace: string, id: string, objective: string, maxTurns = DEFAULT_GOAL_TURNS): Goal {
		const session = this.hub.thread(workspace, id);
		const text = objective.trim();
		if (!text) throw new ChatError("Say what done means: /goal all tests pass", 400);
		if (text.length > OBJECTIVE_MAX)
			throw new ChatError(`A goal is at most ${OBJECTIVE_MAX} characters`, 400);
		const turns = Math.min(MAX_GOAL_TURNS, Math.max(1, Math.round(maxTurns)));
		const goal = this.store.setGoal({
			sessionId: id,
			objective: text,
			status: "active",
			turns: 0,
			maxTurns: turns,
		});
		// A new thread named by its goal, not by the goal's first message from Grid.
		if (session.title === "New chat") this.hub.rename(workspace, id, `Goal: ${text}`.slice(0, 60));
		this.log(goal);
		this.next(session, goal);
		return goal;
	}

	/** Pause, resume or clear the thread's goal. */
	act(workspace: string, id: string, action: "pause" | "resume" | "clear"): Goal | null {
		const session = this.hub.thread(workspace, id);
		const goal = this.store.goal(id);
		if (!goal || goal.status === "cleared") throw new ChatError("This thread has no goal", 404);
		if (action === "clear") {
			this.change(goal, "cleared");
			return null;
		}
		if (action === "pause") {
			if (goal.status !== "active") return goal;
			return this.change(goal, "paused", "Paused by you.");
		}
		// Resuming a goal that ran out of turns gives it as many again.
		const resumed = this.change(
			{
				...goal,
				maxTurns: goal.turns >= goal.maxTurns ? goal.turns + goal.maxTurns : goal.maxTurns,
			},
			"active",
		);
		this.next(session, resumed);
		return resumed;
	}

	private turnDone(session: ChatSessionRow): void {
		const goal = this.store.goal(session.id);
		if (goal?.status !== "active") return;
		const reply = this.hub.lastReply(session.id);
		const verdict = goalVerdict(reply);
		// Only turns Grid sent for the goal count against it; another turn (one going on when the
		// goal was set, a message from the person) can still settle it.
		const asked = this.hub
			.events(session.workspaceId, session.id)
			.findLast((event) => event.type === "user");
		const forGoal =
			asked?.type === "user" && asked.origin?.kind === "grid" && asked.origin.reason === "goal";
		const turns = goal.turns + (forGoal ? 1 : 0);
		if (verdict === "met") {
			this.change({ ...goal, turns }, "met", excerpt(reply.replace(MET, "")));
			return;
		}
		if (verdict === "blocked") {
			this.change({ ...goal, turns }, "blocked", excerpt(reply.replace(BLOCKED, "")));
			return;
		}
		if (!forGoal) {
			this.next(session, goal);
			return;
		}
		if (turns >= goal.maxTurns) {
			this.change(
				{ ...goal, turns },
				"paused",
				`It used all ${goal.maxTurns} turns without saying the goal is met. Resume it to give it as many again.`,
			);
			return;
		}
		const counted = this.store.setGoal({ ...goal, turns });
		this.log(counted);
		this.next(session, counted);
	}

	/** Send the goal's next turn, unless the agent is busy (the turn that ends then sends it). */
	private next(session: ChatSessionRow, goal: Goal): void {
		if (goal.status !== "active" || this.hub.isRunning(session.id) || this.hub.queued(session.id))
			return;
		void this.hub
			.prompt(session.workspaceId, session.id, goalPrompt(goal), [], "send", {
				origin: { kind: "grid", reason: "goal" },
			})
			.catch((cause: unknown) => {
				this.change(
					goal,
					"paused",
					`Its next turn could not start: ${cause instanceof Error ? cause.message : String(cause)}`,
				);
			});
	}

	private change(goal: Goal, status: GoalStatus, note?: string): Goal {
		const next = this.store.setGoal({ ...goal, status });
		this.log(next, note);
		return next;
	}

	private log(goal: Goal, note?: string): void {
		this.hub.logEvent(goal.sessionId, {
			type: "goal",
			objective: goal.objective,
			status: goal.status,
			turns: goal.turns,
			maxTurns: goal.maxTurns,
			...(note ? { note } : {}),
			at: new Date().toISOString(),
		});
	}
}
