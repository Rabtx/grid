import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { ChatEvent } from "../agents/events";
import type { AgentSession, Provider, ProviderInfo } from "../agents/provider";
import type { ChatSessionRow, ChatStore, ProviderCatalog, ProviderSettings } from "./store";

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

/** An agent as the console lists it: what it offers, when that was asked, and your settings. */
export type ProviderListing = ProviderInfo & {
	refreshedAt: string | null;
	settings: ProviderSettings;
};

function merge(
	info: ProviderInfo,
	catalog: ProviderCatalog,
): Pick<ProviderInfo, "models" | "modes"> {
	return {
		models: catalog.models.length ? catalog.models : info.models,
		modes: catalog.modes ?? info.modes,
	};
}

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

	/**
	 * Every agent, with its model list (exact names, effort levels) and this person's settings for
	 * it. Model lists are asked of each agent once and kept, since they rarely change;
	 * `refreshProvider` asks again. A list that fails leaves the basic one rather than failing.
	 */
	async providerList(ownerId: string): Promise<ProviderListing[]> {
		const settings = this.store.providerSettings(ownerId);
		return Promise.all(
			[...this.providers.keys()].map(async (id) => ({
				...(await this.providerInfo(id, false)),
				settings: settings[id] ?? {},
			})),
		);
	}

	/** Ask one agent for its models again, keep the answer, and return the fresh listing. */
	async refreshProvider(ownerId: string, id: string): Promise<ProviderListing> {
		if (!this.providers.has(id)) throw new ChatError(`No agent called ${id}`, 404);
		return {
			...(await this.providerInfo(id, true)),
			settings: this.store.providerSettings(ownerId)[id] ?? {},
		};
	}

	setProviderSettings(ownerId: string, id: string, settings: ProviderSettings): void {
		if (!this.providers.has(id)) throw new ChatError(`No agent called ${id}`, 404);
		this.store.setProviderSettings(ownerId, id, settings);
	}

	private async providerInfo(
		id: string,
		fresh: boolean,
	): Promise<ProviderInfo & { refreshedAt: string | null }> {
		const provider = this.providers.get(id) as Provider;
		const info = provider.info();
		if (!info.available || !provider.catalog) return { ...info, refreshedAt: null };
		const kept = fresh ? null : this.store.catalog(id);
		if (kept) return { ...info, ...merge(info, kept.data), refreshedAt: kept.refreshedAt };
		try {
			const catalog = await provider.catalog(fresh);
			const refreshedAt = catalog.models.length ? this.store.setCatalog(id, catalog) : null;
			return { ...info, ...merge(info, catalog), refreshedAt };
		} catch (cause) {
			console.warn(
				`[runner] ${info.name} did not list its models:`,
				cause instanceof Error ? cause.message : cause,
			);
			const previous = this.store.catalog(id);
			return previous
				? { ...info, ...merge(info, previous.data), refreshedAt: previous.refreshedAt }
				: { ...info, refreshedAt: null };
		}
	}

	/** This person's threads with an agent working right now, for the "running" indicators. */
	running(ownerId: string): { id: string; project: string }[] {
		return [...this.live]
			.filter(([, live]) => live.running)
			.map(([id]) => this.store.get(id))
			.filter((row): row is ChatSessionRow => row?.ownerId === ownerId)
			.map((row) => ({ id: row.id, project: row.project }));
	}

	list(ownerId: string, project: string): ChatSessionRow[] {
		return this.store.list(ownerId, project);
	}

	/**
	 * Where a project's code lives on this machine. The folder is the project: its linked folder,
	 * else `~/Projects/<slug>` when that exists; otherwise there is nowhere to work and a chat
	 * cannot start.
	 */
	defaultCwd(ownerId: string, project: string): string {
		const linked = this.store.projectFolders(ownerId)[project];
		if (linked && isDirectory(linked)) return linked;
		const guess = join(this.projectsDir, project);
		if (isDirectory(guess)) return guess;
		throw new ChatError("Choose this project's folder first: chats work inside it.", 409);
	}

	projectFolders(ownerId: string): Record<string, string> {
		return this.store.projectFolders(ownerId);
	}

	linkProjectFolder(ownerId: string, project: string, path: string): void {
		if (!isDirectory(path)) throw new ChatError(`${path} is not a folder on this machine`, 400);
		this.store.setProjectFolder(ownerId, project, path);
	}

	create(
		ownerId: string,
		input: {
			project: string;
			provider: string;
			cwd?: string;
			model?: string;
			mode?: string;
			effort?: string;
		},
	): ChatSessionRow {
		const provider = this.providers.get(input.provider);
		if (!provider?.info().available)
			throw new ChatError("That agent is not installed on this machine", 400);
		const cwd = input.cwd?.trim() || this.defaultCwd(ownerId, input.project);
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
			effort: input.effort ?? null,
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
		change: { model?: string; mode?: string; effort?: string },
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
				...(change.effort ? { effort: change.effort } : {}),
			});
			return;
		}
		const agent = await this.agentFor(session, live);
		if (change.model) await agent.setModel(change.model);
		if (change.effort) await agent.setEffort(change.effort);
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
			effort: fresh.effort ?? undefined,
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
			const change: { model?: string; mode?: string; effort?: string } = {};
			if (event.model) change.model = event.model;
			if (event.mode) change.mode = event.mode;
			if (event.effort) change.effort = event.effort;
			if (change.model || change.mode || change.effort) this.store.update(id, change);
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
