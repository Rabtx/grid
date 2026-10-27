import type { ChatEvent } from "../agents/events";
import type { ChatHub } from "./hub";
import type { ChatSessionRow } from "./store";

/** Claude keeps a conversation's prompt cached this long: an hour on a plan, five minutes on a key. */
const PLAN_CACHE_MS = 60 * 60_000;
const KEY_CACHE_MS = 5 * 60_000;
/** Compacting is sent this long before the cache expires, so it still reads from the cache. */
const BEFORE_EXPIRY_MS = 90_000;
/** Conversations smaller than this are cheap to read again: they are left as they are. */
export const COMPACT_FROM_TOKENS = 60_000;

/** When an idle conversation should be compacted, or null when it should not. */
export function compactDelay(
	usage: Extract<ChatEvent, { type: "usage" }> | null,
	apiKey: boolean,
): number | null {
	// Only the conversation's own size counts: a turn's summed input overstates it.
	const used = usage?.contextUsed ?? 0;
	if (used < COMPACT_FROM_TOKENS) return null;
	return Math.max(60_000, (apiKey ? KEY_CACHE_MS : PLAN_CACHE_MS) - BEFORE_EXPIRY_MS);
}

/**
 * Idle compaction, for projects that turn it on (project settings): when a Claude Code thread
 * with a large conversation goes quiet, Grid sends `/compact` as a visible turn shortly before
 * Claude's prompt cache for it expires. Compacting then reads the conversation at the cached
 * price, and the next message starts from the shorter one instead of reading it all again at
 * full price. Nothing is sent when anything happens in the thread first, when it waits on
 * someone, or when it has messages queued. Timers live in memory; after a restart `resume` sets
 * them again from each thread's last turn.
 */
export class IdleCompaction {
	private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

	constructor(
		private readonly hub: ChatHub,
		private readonly options: {
			/** Whether a project compacts idle threads (its project settings). */
			enabled: (session: ChatSessionRow) => boolean;
			/** Whether Claude runs on an API key here (a five-minute cache) rather than a plan. */
			apiKey?: () => boolean;
		},
	) {
		hub.onTurnEnded((session, reason) => {
			this.clear(session.id);
			if (reason === "done") this.schedule(session);
		});
		hub.onEvent((session, event) => {
			if (event.type === "turn_start") this.clear(session.id);
		});
		hub.onRemoved((thread) => this.clear(thread));
	}

	/** Whether a thread has a compaction waiting (for tests and the console). */
	waiting(sessionId: string): boolean {
		return this.timers.has(sessionId);
	}

	/**
	 * After a restart: the compactions that were waiting, worked out again from when each Claude
	 * Code thread's last turn ended. One whose time has passed is left: its cache has expired.
	 */
	resume(now = Date.now()): number {
		const since = new Date(now - PLAN_CACHE_MS).toISOString();
		for (const session of this.hub.recentThreads("claude", since)) {
			if (this.hub.isRunning(session.id)) continue;
			const last = this.hub
				.events(session.workspaceId, session.id)
				.findLast((event) => event.type === "turn_start" || event.type === "turn_end");
			if (last?.type !== "turn_end" || last.reason !== "done" || !last.at) continue;
			this.schedule(session, Date.parse(last.at), now);
		}
		return this.timers.size;
	}

	stop(): void {
		for (const id of this.timers.keys()) this.clear(id);
	}

	private clear(id: string): void {
		clearTimeout(this.timers.get(id));
		this.timers.delete(id);
	}

	private schedule(session: ChatSessionRow, endedAt = Date.now(), now = Date.now()): void {
		if (session.provider !== "claude" || !this.options.enabled(session)) return;
		const usage =
			(this.hub
				.events(session.workspaceId, session.id)
				.findLast((event) => event.type === "usage") as
				| Extract<ChatEvent, { type: "usage" }>
				| undefined) ?? null;
		// The turn was a compaction itself: nothing more to gain until the conversation grows again.
		const asked = this.hub
			.events(session.workspaceId, session.id)
			.findLast((event) => event.type === "user");
		if (
			asked?.type === "user" &&
			asked.origin?.kind === "grid" &&
			asked.origin.reason === "compact"
		)
			return;
		const delay = compactDelay(
			usage,
			this.options.apiKey?.() ?? Boolean(process.env.ANTHROPIC_API_KEY),
		);
		if (delay === null) return;
		const wait = delay - (now - endedAt);
		if (wait <= 0) return;
		const turns = this.hub.turnCount(session.id);
		const timer = setTimeout(() => {
			this.timers.delete(session.id);
			if (
				this.hub.isRunning(session.id) ||
				this.hub.turnCount(session.id) !== turns ||
				this.hub.queued(session.id) ||
				this.hub.waitsOnPerson(session.id) ||
				!this.options.enabled(session)
			)
				return;
			void this.hub
				.prompt(session.workspaceId, session.id, "/compact", [], "send", {
					origin: { kind: "grid", reason: "compact" },
				})
				.catch((cause: unknown) => {
					console.warn(
						"[compact] could not compact a thread:",
						cause instanceof Error ? cause.message : cause,
					);
				});
		}, wait);
		timer.unref?.();
		this.timers.set(session.id, timer);
	}
}
