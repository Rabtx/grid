import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { ChatEvent } from "../agents/events";
import type { AgentSession, Provider, ProviderInfo } from "../agents/provider";
import type { ChatSessionRow, ChatStore } from "./store";

/** One device watching a session. */
export type ChatClient = {
	event: (event: ChatEvent) => void;
	state: (state: { running: boolean }) => void;
};

type Live = {
	agent: Promise<AgentSession> | null;
	clients: Set<ChatClient>;
	running: boolean;
	/** Streamed text not yet written: consecutive deltas become one log entry. */
	buffered: Extract<ChatEvent, { type: "message" | "reasoning" }> | null;
	flushTimer: ReturnType<typeof setTimeout> | undefined;
	idleTimer: ReturnType<typeof setTimeout> | undefined;
};

export class ChatError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
		this.name = "ChatError";
	}
}

// An agent nobody has used for this long is stopped; the next message resumes it.
const IDLE_MS = 15 * 60 * 1000;
const FLUSH_MS = 750;

function isDirectory(path: string): boolean {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

/**
 * Every chat session: starting the agent when it is first needed, logging what it does, fanning
 * events out to each attached device, and parking agents nobody is using.
 */
export class ChatHub {
	private readonly live = new Map<string, Live>();

	constructor(
		private readonly store: ChatStore,
		private readonly providers: Map<string, Provider>,
		private readonly projectsDir: string = join(homedir(), "Projects"),
	) {}

	providerList(): ProviderInfo[] {
		return [...this.providers.values()].map((provider) => provider.info());
	}

	list(ownerId: string, project: string): ChatSessionRow[] {
		return this.store.list(ownerId, project);
	}

	/** Where a project's code lives on this machine, if it follows the usual layout. */
	defaultCwd(project: string): string {
		const guess = join(this.projectsDir, project);
		return isDirectory(guess) ? guess : homedir();
	}

	create(
		ownerId: string,
		input: { project: string; provider: string; cwd?: string; model?: string; mode?: string },
	): ChatSessionRow {
		const provider = this.providers.get(input.provider);
		if (!provider?.info().available)
			throw new ChatError("That agent is not installed on this machine", 400);
		const cwd = input.cwd?.trim() || this.defaultCwd(input.project);
		if (!existsSync(cwd) || !isDirectory(cwd))
			throw new ChatError(`${cwd} is not a folder on this machine`, 400);
		return this.store.create({
			id: crypto.randomUUID(),
			ownerId,
			project: input.project,
			provider: input.provider,
			title: "New chat",
			cwd,
			model: input.model ?? null,
			mode: input.mode ?? provider.info().defaultMode ?? null,
		});
	}

	delete(ownerId: string, id: string): void {
		this.owned(ownerId, id);
		this.park(id);
		this.store.delete(id);
	}

	rename(ownerId: string, id: string, title: string): void {
		this.owned(ownerId, id);
		this.store.update(id, { title: title.trim().slice(0, 120) || "Chat" });
	}

	/** Watch a session: its whole log first, then live events. Returns the detach function. */
	attach(
		ownerId: string,
		id: string,
		client: ChatClient,
	): { session: ChatSessionRow; history: ChatEvent[]; running: boolean; detach: () => void } {
		const session = this.owned(ownerId, id);
		const live = this.liveFor(id);
		this.flush(id, live);
		if (!live.running && !live.agent) this.closeStaleTurn(id);
		live.clients.add(client);
		return {
			session,
			history: this.store.events(id),
			running: live.running,
			detach: () => {
				live.clients.delete(client);
			},
		};
	}

	async prompt(ownerId: string, id: string, text: string): Promise<void> {
		const session = this.owned(ownerId, id);
		const live = this.liveFor(id);
		const message = text.trim();
		if (!message) return;
		if (live.running) throw new ChatError("The agent is still working on the last message", 409);

		if (session.title === "New chat") {
			this.store.update(id, { title: message.replace(/\s+/g, " ").slice(0, 60) });
		}
		this.record(id, { type: "user", text: message });
		this.setRunning(id, live, true);
		this.record(id, { type: "turn_start" });

		let result: Awaited<ReturnType<AgentSession["prompt"]>>;
		try {
			const agent = await this.agentFor(session, live);
			result = await agent.prompt(message);
		} catch (cause) {
			result = { reason: "error", error: cause instanceof Error ? cause.message : String(cause) };
			// A failed start leaves nothing to reuse.
			live.agent = null;
		}
		this.record(id, { type: "turn_end", reason: result.reason, error: result.error });
		this.setRunning(id, live, false);
		this.store.touch(id);
		this.scheduleIdle(id, live);
	}

	cancel(ownerId: string, id: string): void {
		this.owned(ownerId, id);
		void this.live.get(id)?.agent?.then((agent) => agent.cancel());
	}

	approve(ownerId: string, id: string, approvalId: string, optionId: string | null): void {
		this.owned(ownerId, id);
		void this.live.get(id)?.agent?.then((agent) => agent.approve(approvalId, optionId));
	}

	async configure(
		ownerId: string,
		id: string,
		change: { model?: string; mode?: string },
	): Promise<void> {
		const session = this.owned(ownerId, id);
		this.store.update(id, change);
		const live = this.live.get(id);
		if (!live?.agent) {
			// Not running: remember it and tell watchers; the next start uses it.
			this.record(id, {
				type: "info",
				...(change.model ? { model: change.model } : {}),
				...(change.mode ? { mode: change.mode } : {}),
			});
			return;
		}
		const agent = await this.agentFor(session, live);
		if (change.model) await agent.setModel(change.model);
		if (change.mode) await agent.setMode(change.mode);
	}

	closeAll(): void {
		for (const id of this.live.keys()) this.park(id);
	}

	private owned(ownerId: string, id: string): ChatSessionRow {
		const session = this.store.get(id);
		if (!session || session.ownerId !== ownerId)
			throw new ChatError("That chat does not exist", 404);
		return session;
	}

	private liveFor(id: string): Live {
		let live = this.live.get(id);
		if (!live) {
			live = {
				agent: null,
				clients: new Set(),
				running: false,
				buffered: null,
				flushTimer: undefined,
				idleTimer: undefined,
			};
			this.live.set(id, live);
		}
		return live;
	}

	private agentFor(session: ChatSessionRow, live: Live): Promise<AgentSession> {
		clearTimeout(live.idleTimer);
		if (live.agent) return live.agent;
		const provider = this.providers.get(session.provider);
		if (!provider) return Promise.reject(new ChatError("That agent is no longer available", 400));
		const fresh = this.store.get(session.id) ?? session;
		live.agent = provider.start({
			cwd: fresh.cwd,
			model: fresh.model ?? undefined,
			mode: fresh.mode ?? undefined,
			resume: fresh.resumeToken ?? undefined,
			emit: (event) => this.record(session.id, event),
			onResumeToken: (token) => this.store.update(session.id, { resumeToken: token }),
		});
		live.agent.catch(() => {
			live.agent = null;
		});
		return live.agent;
	}

	/** Log an event and send it to every device watching. Streamed text is merged before it is written. */
	private record(id: string, event: ChatEvent): void {
		const live = this.liveFor(id);
		if (event.type === "info") {
			const change: { model?: string; mode?: string } = {};
			if (event.model) change.model = event.model;
			if (event.mode) change.mode = event.mode;
			if (change.model || change.mode) this.store.update(id, change);
		}
		for (const client of live.clients) client.event(event);

		if (event.type === "message" || event.type === "reasoning") {
			if (live.buffered && live.buffered.type === event.type) {
				live.buffered = { ...live.buffered, text: live.buffered.text + event.text };
			} else {
				this.flush(id, live);
				live.buffered = { ...event };
			}
			clearTimeout(live.flushTimer);
			live.flushTimer = setTimeout(() => this.flush(id, live), FLUSH_MS);
			return;
		}
		this.flush(id, live);
		this.store.append(id, [event]);
	}

	private flush(id: string, live: Live): void {
		clearTimeout(live.flushTimer);
		if (!live.buffered) return;
		this.store.append(id, [live.buffered]);
		live.buffered = null;
	}

	private setRunning(id: string, live: Live, running: boolean): void {
		live.running = running;
		for (const client of live.clients) client.state({ running });
		if (!running) this.flush(id, live);
	}

	/**
	 * A turn left open in the log with no agent behind it (the runner restarted mid-turn): close
	 * it, and void its pending approvals, so the transcript does not show work that never ends.
	 */
	private closeStaleTurn(id: string): void {
		const events = this.store.events(id);
		const openApprovals = new Set<string>();
		let open = false;
		for (const event of events) {
			if (event.type === "turn_start") open = true;
			else if (event.type === "turn_end") open = false;
			else if (event.type === "approval") openApprovals.add(event.id);
			else if (event.type === "approval_resolved") openApprovals.delete(event.id);
		}
		const fixes: ChatEvent[] = [...openApprovals].map((approvalId) => ({
			type: "approval_resolved",
			id: approvalId,
			optionId: null,
		}));
		if (open)
			fixes.push({
				type: "turn_end",
				reason: "error",
				error: "Interrupted: the runner restarted.",
			});
		this.store.append(id, fixes);
	}

	private scheduleIdle(id: string, live: Live): void {
		clearTimeout(live.idleTimer);
		live.idleTimer = setTimeout(() => {
			if (!live.running) this.park(id);
		}, IDLE_MS);
	}

	private park(id: string): void {
		const live = this.live.get(id);
		if (!live) return;
		clearTimeout(live.idleTimer);
		this.flush(id, live);
		void live.agent?.then((agent) => agent.close()).catch(() => undefined);
		live.agent = null;
		live.running = false;
		if (live.clients.size === 0) this.live.delete(id);
	}
}
