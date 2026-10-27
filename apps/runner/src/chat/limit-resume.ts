import type { Accounts } from "./accounts";
import type { AutonomyStore } from "./autonomy-store";
import { limitResetsAt, turnErrorKind } from "./errors";
import type { ChatHub } from "./hub";
import type { ChatSessionRow } from "./store";

/** What Grid sends a thread once the usage limit that stopped it has reset. */
export const LIMIT_RESUME_PROMPT =
	"Your usage limit has reset. Continue where you left off: check what you had already done before repeating anything.";

/** How long after the reset Grid waits, so the provider's own clock has turned over too. */
const AFTER_RESET_MS = 60_000;
/** Resets further off than this are not waited for (a weekly limit days away): the person decides. */
const MAX_WAIT_MS = 8 * 86_400_000;

/**
 * A thread a used-up plan stopped carries on by itself once the limit resets. When a turn fails
 * with a usage limit, the reset time comes from the agent's own words or, failing that, from what
 * the account's agents last reported (Settings → Agents → Accounts); with neither, nothing is
 * scheduled and the person carries on. The wait is kept in SQLite, so a restart keeps it.
 *
 * It does not carry on when the person sends something themselves first or cancels it, when the
 * thread is working again by then, or when the same reset would be waited for twice (a turn
 * carried on at a reset that fails again with the same reset is left for the person).
 */
export class LimitResumes {
	private readonly now: () => Date;
	private readonly accounts: Accounts | null;
	/** The reset each thread was last carried on at, so the same one is not waited for again. */
	private readonly fired = new Map<string, number>();
	private timer: ReturnType<typeof setInterval> | null = null;

	constructor(
		private readonly hub: ChatHub,
		private readonly store: AutonomyStore,
		options: { accounts?: Accounts | null; now?: () => Date } = {},
	) {
		this.now = options.now ?? (() => new Date());
		this.accounts = options.accounts ?? null;
		hub.onTurnEnded((session, reason) => {
			if (reason === "error") this.turnFailed(session);
		});
		hub.onEvent((session, event) => {
			// The person carried on themselves: the wait is theirs to drop.
			if (event.type === "user" && !event.origin) this.cancel(session.id, "cancelled");
		});
		hub.onRemoved((thread) => this.store.dropLimitResume(thread));
	}

	/** Look for resets that are due every so often. */
	watch(everyMs = 30_000): void {
		this.timer ??= setInterval(() => {
			try {
				this.tick();
			} catch (cause) {
				console.warn("[limits] check failed:", cause instanceof Error ? cause.message : cause);
			}
		}, everyMs);
		this.timer.unref?.();
	}

	stop(): void {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
	}

	/** When a thread waits for its limit to reset, or null. */
	pending(sessionId: string): string | null {
		return this.store.limitResume(sessionId)?.resumeAt ?? null;
	}

	/** The person (or their own message) cancels the wait. */
	cancel(sessionId: string, ended: "cancelled" | "resumed" = "cancelled"): boolean {
		const waiting = this.store.limitResume(sessionId);
		if (!waiting || !this.store.dropLimitResume(sessionId)) return false;
		this.hub.logEvent(sessionId, {
			type: "limit_wait",
			resetsAt: waiting.resumeAt,
			ended,
			at: this.now().toISOString(),
		});
		return true;
	}

	private turnFailed(session: ChatSessionRow): void {
		const end = this.hub.turnOutcome(session.workspaceId, session.id);
		const error = end?.error ?? "";
		if (turnErrorKind(error) !== "usage-limit") return;
		const now = this.now();
		const reset = limitResetsAt(error, now) ?? this.accountReset(session, now);
		if (!reset) return;
		const wait = reset.getTime() - now.getTime();
		if (wait <= 0 || wait > MAX_WAIT_MS) return;
		// Carried on at this reset already and stopped by it again: a loop, not a new wait.
		if ((this.fired.get(session.id) ?? 0) >= reset.getTime()) return;
		const resumeAt = new Date(reset.getTime() + AFTER_RESET_MS).toISOString();
		this.store.setLimitResume(session.id, resumeAt, now);
		this.hub.logEvent(session.id, {
			type: "limit_wait",
			resetsAt: resumeAt,
			at: now.toISOString(),
		});
	}

	/** The latest reset among the windows the thread's account says are used up, if any. */
	private accountReset(session: ChatSessionRow, now: Date): Date | null {
		const usage = this.accounts
			?.usage(session.ownerId)
			.find(
				(entry) =>
					entry.provider === session.provider && entry.account === (session.account ?? null),
			);
		const resets = (usage?.limits ?? [])
			.filter((limit) => limit.limited && limit.resetsAt)
			.map((limit) => Date.parse(limit.resetsAt ?? ""))
			.filter((at) => Number.isFinite(at) && at > now.getTime());
		return resets.length ? new Date(Math.max(...resets)) : null;
	}

	/** Carry on each thread whose reset has come. */
	tick(): void {
		const now = this.now();
		for (const due of this.store.dueLimitResumes(now)) {
			const session = this.hub.sessionRow(due.sessionId);
			if (!session) {
				this.store.dropLimitResume(due.sessionId);
				continue;
			}
			// Working again already (someone, or something, carried it on): nothing to do.
			if (this.hub.isRunning(session.id)) {
				this.cancel(session.id, "cancelled");
				continue;
			}
			this.fired.set(session.id, Date.parse(due.resumeAt) - AFTER_RESET_MS);
			this.cancel(session.id, "resumed");
			void this.hub
				.prompt(session.workspaceId, session.id, LIMIT_RESUME_PROMPT, [], "send", {
					origin: { kind: "grid", reason: "limit" },
				})
				.catch((cause: unknown) => {
					console.warn(
						"[limits] could not carry a thread on:",
						cause instanceof Error ? cause.message : cause,
					);
				});
		}
	}
}
