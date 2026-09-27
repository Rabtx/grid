import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { ChatEvent } from "../agents/events";
import type { AgentSession, Provider, ProviderInfo } from "../agents/provider";
import { AGENT_SETUP } from "../agents/setup";
import type { Who } from "../auth";
import { insideProjectsDir } from "../folders/folders";
import type {
	ChatSessionRow,
	ChatStore,
	ProjectSettings,
	ProviderCatalog,
	ProviderSettings,
} from "./store";
import {
	createWorktree,
	fetchBranch,
	leftoverWorktrees,
	removeWorktree,
	repoRoot,
	type Worktree,
	WorktreeError,
	type WorktreeRequest,
	type WorktreeStatus,
	worktreeStatus,
} from "./worktrees";

/** A worktree as the settings page lists it: how it stands, and the chat using it, if any. */
export type WorktreeEntry = WorktreeStatus & {
	project: string;
	chat: { id: string; title: string } | null;
};

/** One device watching a session. `n` numbers each event, for catching up after a drop. */
export type ChatClient = {
	event: (event: ChatEvent, n: number) => void;
	state: (state: { running: boolean }) => void;
	/** False while the device has the app in the background; unset means it is looking. */
	watching?: () => boolean;
};

/** Called when a turn ends or an agent waits for approval and no device is looking at the chat. */
export type AttentionListener = (session: ChatSessionRow, event: ChatEvent) => void;

/**
 * Where a device got to in a session's live events: which run of the runner (`epoch`, new each
 * time a session is loaded) and the number of the next event it has not seen.
 */
export type ChatCursor = { epoch: string; next: number };

// Recent live events kept per session, so a device back from the background gets only what it
// missed. Streamed text arrives in many small pieces, hence the generous count.
const JOURNAL_LIMIT = 20_000;

type Live = {
	agent: Promise<AgentSession> | null;
	clients: Set<ChatClient>;
	epoch: string;
	/** The last events sent to devices, numbered from `journalStart`. */
	journal: ChatEvent[];
	journalStart: number;
	running: boolean;
	/** Streamed text not yet written: consecutive deltas become one log entry. */
	buffered: Extract<ChatEvent, { type: "message" | "reasoning" }> | null;
	flushTimer: ReturnType<typeof setTimeout> | undefined;
	idleTimer: ReturnType<typeof setTimeout> | undefined;
};

/** Whether Grid can install and sign in an agent here, and whether it is signed in. */
export type ProviderSetup = {
	canInstall: boolean;
	canSignIn: boolean;
	signInOptional: boolean;
	/** Null when not installed, or when the agent gives no way to tell. */
	signedIn: boolean | null;
	docs: string | null;
};

/** An agent as the console lists it: what it offers, when that was asked, and your settings. */
export type ProviderListing = ProviderInfo & {
	refreshedAt: string | null;
	settings: ProviderSettings;
	setup: ProviderSetup;
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

async function setupOf(id: string, available: boolean): Promise<ProviderSetup> {
	const setup = AGENT_SETUP[id];
	return {
		canInstall: !available && Boolean(setup?.install),
		canSignIn: available && Boolean(setup?.signIn),
		signInOptional: setup?.signInOptional === true,
		signedIn: available && setup?.signedIn ? await setup.signedIn().catch(() => null) : null,
		docs: setup?.docs ?? null,
	};
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
	private attention: AttentionListener | null = null;

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
			[...this.providers.keys()].map(async (id) => {
				const info = await this.providerInfo(id, false);
				return { ...info, settings: settings[id] ?? {}, setup: await setupOf(id, info.available) };
			}),
		);
	}

	/** Ask one agent for its models again, keep the answer, and return the fresh listing. */
	async refreshProvider(ownerId: string, id: string): Promise<ProviderListing> {
		if (!this.providers.has(id)) throw new ChatError(`No agent called ${id}`, 404);
		const info = await this.providerInfo(id, true);
		return {
			...info,
			settings: this.store.providerSettings(ownerId)[id] ?? {},
			setup: await setupOf(id, info.available),
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

	/** Hear about turns that end, and approvals that wait, while nobody is watching the chat. */
	onUnwatchedAttention(listener: AttentionListener): void {
		this.attention = listener;
	}

	/** The workspace's threads with an agent working right now, for the "running" indicators. */
	running(workspace: string): { id: string; project: string }[] {
		return [...this.live]
			.filter(([, live]) => live.running)
			.map(([id]) => this.store.get(id))
			.filter((row): row is ChatSessionRow => row?.workspaceId === workspace)
			.map((row) => ({ id: row.id, project: row.project }));
	}

	list(workspace: string, project: string): ChatSessionRow[] {
		return this.store.list(workspace, project);
	}

	/** See `ChatStore.adopt`. */
	adopt(who: Who): void {
		this.store.adopt(who.userId, who.workspace);
	}

	/**
	 * Where a project's code lives on this machine. The folder is the project: its linked folder,
	 * else `~/Projects/<slug>` when that exists; otherwise there is nowhere to work and a chat
	 * cannot start.
	 */
	defaultCwd(workspace: string, project: string): string {
		const linked = this.store.projectFolders(workspace)[project];
		if (linked && isDirectory(linked)) return this.withinProjectsDir(linked);
		const guess = join(this.projectsDir, project);
		if (isDirectory(guess)) return this.withinProjectsDir(guess);
		throw new ChatError("Choose this project's folder first: chats work inside it.", 409);
	}

	projectFolders(workspace: string): Record<string, string> {
		return this.store.projectFolders(workspace);
	}

	linkProjectFolder(workspace: string, project: string, path: string): void {
		if (!isDirectory(path)) throw new ChatError(`${path} is not a folder on this machine`, 400);
		this.store.setProjectFolder(workspace, project, this.withinProjectsDir(path));
	}

	create(
		who: Who,
		input: {
			project: string;
			provider: string;
			cwd?: string;
			model?: string;
			mode?: string;
			effort?: string;
			/** Its own git worktree; by default what the project is set to. */
			worktree?: boolean;
			/** The new worktree's branch; `grid/chat-<id>` when not given. */
			branch?: string;
			/** Work on `branch` as it is instead of making a new one from what is checked out. */
			existing?: boolean;
			/** The pull request this worktree's branch is (see `WorktreeRequest`). */
			pull?: number;
			/** That pull request comes from a fork. */
			fork?: boolean;
		},
	): ChatSessionRow {
		const provider = this.providers.get(input.provider);
		if (!provider?.info().available)
			throw new ChatError("That agent is not installed on this machine", 400);
		const cwd = input.cwd?.trim() || this.defaultCwd(who.workspace, input.project);
		if (!existsSync(cwd) || !isDirectory(cwd))
			throw new ChatError(`${cwd} is not a folder on this machine`, 400);
		const boundedCwd = this.withinProjectsDir(cwd);
		const id = crypto.randomUUID();
		const wanted =
			input.worktree ?? this.store.projectSettings(who.workspace, input.project).worktrees;
		const own = wanted
			? this.worktreeFor(boundedCwd, id, {
					branch: input.branch,
					existing: input.existing,
					pull: input.pull,
					fork: input.fork,
				})
			: null;
		return this.store.create({
			id,
			ownerId: who.userId,
			workspaceId: who.workspace,
			project: input.project,
			provider: input.provider,
			title: "New chat",
			cwd: own ? this.withinProjectsDir(own.cwd) : boundedCwd,
			model: input.model ?? null,
			mode: input.mode ?? provider.info().defaultMode ?? null,
			effort: input.effort ?? null,
			worktree: own?.worktree ?? null,
		});
	}

	/**
	 * Before `create` puts a chat in a worktree on an existing branch: fetch that branch (or a
	 * fork's pull request) without blocking, so `create` itself never waits on the network.
	 */
	async prepareWorktree(
		who: Who,
		input: { project: string; cwd?: string; branch?: string; pull?: number; fork?: boolean },
	): Promise<void> {
		const cwd = input.cwd?.trim() || this.defaultCwd(who.workspace, input.project);
		if (!isDirectory(cwd)) return;
		await fetchBranch(this.withinProjectsDir(cwd), {
			branch: input.branch,
			pull: input.pull,
			fork: input.fork,
		});
	}

	/** A worktree for a new chat, or null when the folder is not in a git repository. */
	private worktreeFor(
		folder: string,
		id: string,
		request: WorktreeRequest = {},
	): ReturnType<typeof createWorktree> {
		try {
			return createWorktree(folder, id, this.projectsDir, request);
		} catch (cause) {
			if (cause instanceof WorktreeError) throw new ChatError(cause.message, cause.status);
			throw cause;
		}
	}

	/** How a chat's worktree stands (changed files, unpushed commits), or null without one. */
	worktree(workspace: string, id: string): WorktreeStatus | null {
		const session = this.owned(workspace, id);
		return session.worktree ? worktreeStatus(session.worktree) : null;
	}

	/**
	 * Remove a chat's worktree; the chat carries on in the project's own folder. Refuses to throw
	 * away uncommitted changes, or (deleting the branch too) unpushed commits, without `force`.
	 */
	discardWorktree(
		workspace: string,
		id: string,
		options: { deleteBranch: boolean; force?: boolean },
	): void {
		const session = this.owned(workspace, id);
		if (!session.worktree) throw new ChatError("This chat has no worktree", 404);
		if (this.live.get(id)?.running) throw new ChatError("Stop the agent first", 409);
		try {
			removeWorktree(session.worktree, options);
		} catch (cause) {
			if (cause instanceof WorktreeError) throw new ChatError(cause.message, cause.status);
			throw cause;
		}
		// The agent was working in the worktree: the next message starts it in the project folder.
		this.park(id);
		this.store.update(id, { worktree: null, cwd: session.worktree.origin, resumeToken: null });
	}

	/**
	 * Every Grid worktree of the workspace's projects on this machine, with how it stands: those
	 * chats work in, and those left over from deleted chats (kept because they held work).
	 */
	worktrees(workspace: string): WorktreeEntry[] {
		const entries: WorktreeEntry[] = [];
		for (const session of this.store.withWorktrees(workspace)) {
			if (!session.worktree) continue;
			entries.push({
				...worktreeStatus(session.worktree),
				project: session.project,
				chat: { id: session.id, title: session.title },
			});
		}
		for (const { project, worktree } of this.leftovers(workspace)) {
			entries.push({ ...worktreeStatus(worktree), project, chat: null });
		}
		return entries;
	}

	/**
	 * Remove a worktree from the list: a chat's (the chat carries on in its project folder) or a
	 * leftover. The same refusals as removing it from a chat: nothing is lost without `force`.
	 */
	removeWorktreeAt(
		workspace: string,
		path: string,
		options: { deleteBranch: boolean; force?: boolean },
	): void {
		const owner = this.store.withWorktrees(workspace).find((row) => row.worktree?.path === path);
		if (owner) return this.discardWorktree(workspace, owner.id, options);
		const leftover = this.leftovers(workspace).find(
			({ worktree }) => worktree.path === path,
		)?.worktree;
		if (!leftover) throw new ChatError("That worktree is not one of this workspace's", 404);
		try {
			removeWorktree(leftover, options);
		} catch (cause) {
			if (cause instanceof WorktreeError) throw new ChatError(cause.message, cause.status);
			throw cause;
		}
	}

	/** Remove every worktree that holds nothing (no changes, no commits of its own). */
	cleanWorktrees(workspace: string): number {
		let removed = 0;
		for (const entry of this.worktrees(workspace)) {
			if (entry.changed > 0 || entry.unpushed > 0) continue;
			const running = entry.chat && this.live.get(entry.chat.id)?.running;
			if (running) continue;
			this.removeWorktreeAt(workspace, entry.path, { deleteBranch: true });
			removed++;
		}
		return removed;
	}

	/** Grid worktrees on disk that no chat of the workspace uses, with the project they belong to. */
	private leftovers(workspace: string): { project: string; worktree: Worktree }[] {
		const used = new Set(
			this.store
				.withWorktrees(workspace)
				.map((row) => row.worktree?.path)
				.filter((path): path is string => Boolean(path)),
		);
		const found: { project: string; worktree: Worktree }[] = [];
		const repos = new Set<string>();
		for (const [project, folder] of Object.entries(this.store.projectFolders(workspace))) {
			const repo = isDirectory(folder) ? repoRoot(folder) : null;
			if (!repo || repos.has(repo)) continue;
			repos.add(repo);
			for (const worktree of leftoverWorktrees(repo, this.projectsDir, used))
				found.push({ project, worktree });
		}
		return found;
	}

	projectSettings(workspace: string, project: string): ProjectSettings {
		return this.store.projectSettings(workspace, project);
	}

	setProjectSettings(workspace: string, project: string, settings: ProjectSettings): void {
		this.store.setProjectSettings(workspace, project, settings);
	}

	private withinProjectsDir(path: string): string {
		try {
			return insideProjectsDir(path, this.projectsDir);
		} catch {
			throw new ChatError("That folder is outside the projects directory", 403);
		}
	}

	/**
	 * Delete a chat. Its worktree goes too when nothing would be lost (no changes, no commits of
	 * its own); otherwise it stays on disk, with its branch, for the person to deal with.
	 */
	delete(workspace: string, id: string): void {
		const session = this.owned(workspace, id);
		this.park(id);
		if (session.worktree) {
			try {
				removeWorktree(session.worktree, { deleteBranch: true });
			} catch (cause) {
				if (!(cause instanceof WorktreeError)) throw cause;
				console.warn(`[runner] kept the worktree of a deleted chat: ${cause.message}`);
			}
		}
		this.store.delete(id);
	}

	rename(workspace: string, id: string, title: string): void {
		this.owned(workspace, id);
		this.store.update(id, { title: title.trim().slice(0, 120) || "Chat" });
	}

	/**
	 * Watch a session: its whole log first, then live events. A device that was watching before
	 * (`resume`, from this same run) gets only the events it missed instead, when they are still
	 * kept. Returns the detach function.
	 */
	attach(
		workspace: string,
		id: string,
		client: ChatClient,
		resume?: ChatCursor,
	): {
		session: ChatSessionRow;
		history: ChatEvent[];
		/** Set when catching up: the missed events, in place of `history`. */
		missed: ChatEvent[] | null;
		running: boolean;
		cursor: ChatCursor;
		detach: () => void;
	} {
		const session = this.owned(workspace, id);
		const live = this.liveFor(id);
		this.flush(id, live);
		if (!live.running && !live.agent) this.closeStaleTurn(id, live);
		const end = live.journalStart + live.journal.length;
		const canResume =
			resume?.epoch === live.epoch && resume.next >= live.journalStart && resume.next <= end;
		live.clients.add(client);
		return {
			session,
			history: canResume ? [] : this.store.events(id),
			missed: canResume ? live.journal.slice(resume.next - live.journalStart) : null,
			running: live.running,
			cursor: { epoch: live.epoch, next: end },
			detach: () => {
				live.clients.delete(client);
			},
		};
	}

	async prompt(workspace: string, id: string, text: string): Promise<void> {
		const session = this.owned(workspace, id);
		const live = this.liveFor(id);
		const message = text.trim();
		if (!message) return;
		if (live.running) throw new ChatError("The agent is still working on the last message", 409);

		if (session.title === "New chat") {
			this.store.update(id, { title: message.replace(/\s+/g, " ").slice(0, 60) });
		}
		this.record(id, { type: "user", text: message });
		this.setRunning(id, live, true);
		this.record(id, { type: "turn_start", at: new Date().toISOString() });

		let result: Awaited<ReturnType<AgentSession["prompt"]>>;
		try {
			const agent = await this.agentFor(session, live);
			result = await agent.prompt(message);
		} catch (cause) {
			result = { reason: "error", error: cause instanceof Error ? cause.message : String(cause) };
			// A failed start leaves nothing to reuse.
			live.agent = null;
		}
		this.record(id, {
			type: "turn_end",
			reason: result.reason,
			error: result.error,
			at: new Date().toISOString(),
		});
		this.setRunning(id, live, false);
		this.store.touch(id);
		this.scheduleIdle(id, live);
	}

	cancel(workspace: string, id: string): void {
		this.owned(workspace, id);
		void this.live.get(id)?.agent?.then((agent) => agent.cancel());
	}

	approve(workspace: string, id: string, approvalId: string, optionId: string | null): void {
		this.owned(workspace, id);
		void this.live.get(id)?.agent?.then((agent) => agent.approve(approvalId, optionId));
	}

	async configure(
		workspace: string,
		id: string,
		change: { model?: string; mode?: string; effort?: string },
	): Promise<void> {
		const session = this.owned(workspace, id);
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

	/** A chat in this workspace; one elsewhere answers like one that does not exist. */
	private owned(workspace: string, id: string): ChatSessionRow {
		const session = this.store.get(id);
		if (!session || session.workspaceId !== workspace)
			throw new ChatError("That chat does not exist", 404);
		return session;
	}

	private liveFor(id: string): Live {
		let live = this.live.get(id);
		if (!live) {
			live = {
				agent: null,
				clients: new Set(),
				epoch: crypto.randomUUID(),
				journal: [],
				journalStart: 0,
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
		const cwd = this.withinProjectsDir(fresh.cwd);
		live.agent = provider.start({
			cwd,
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
		const n = this.journalPush(live, event);
		for (const client of live.clients) client.event(event, n);
		if (
			(event.type === "turn_end" || event.type === "approval") &&
			![...live.clients].some((client) => client.watching?.() ?? true)
		) {
			const session = this.store.get(id);
			if (session) this.attention?.(session, event);
		}

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

	/** Number an event and keep it for devices catching up. */
	private journalPush(live: Live, event: ChatEvent): number {
		const n = live.journalStart + live.journal.length;
		live.journal.push(event);
		if (live.journal.length > JOURNAL_LIMIT) {
			const drop = live.journal.length - JOURNAL_LIMIT;
			live.journal.splice(0, drop);
			live.journalStart += drop;
		}
		return n;
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
	private closeStaleTurn(id: string, live: Live): void {
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
		// Devices catching up see them too.
		for (const fix of fixes) this.journalPush(live, fix);
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
