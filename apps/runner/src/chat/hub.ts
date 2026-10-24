import {
	type Attachment,
	imageType,
	MAX_ATTACHMENT_BYTES,
	MAX_ATTACHMENTS,
	MAX_IMAGE_BLOCK_BYTES,
	MAX_IMAGE_BLOCKS_BYTES,
	MAX_SESSION_ATTACHMENTS,
	MAX_SESSION_BYTES,
} from "./attachments";
import { historyBrief } from "./history-brief";
import { existsSync, realpathSync, statSync } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import type {
	AgentCommand,
	ApprovalOption,
	ChatAttachment,
	ChatEvent,
	QueuedMessage,
	ToolKind,
} from "../agents/events";
import {
	changedFiles,
	CheckpointError,
	checkpointRef,
	dropCheckpoints,
	restore,
	snapshot,
} from "./checkpoints";
import {
	readVisual,
	SHOW_VISUAL_DESCRIPTION,
	SHOW_VISUAL_SCHEMA,
	VisualError,
	VISUALS_PER_TURN,
} from "./visuals";
import { type AgentPolicy, answerFor, branchNote, DEFAULT_POLICY } from "../agents/policy";
import type { AgentSession, McpServerSpec, Provider, ProviderInfo } from "../agents/provider";
import { AGENT_SETUP } from "../agents/setup";
import type { Who } from "../auth";
import { isAdmin, may, NOT_ALLOWED } from "../permissions";
import { insideProjectsDir } from "../folders/folders";
import {
	isRetiredNotice,
	type TurnErrorKind,
	turnErrorKind,
	turnErrorMessage,
	turnRetryable,
} from "./errors";
import type {
	AgentEdit,
	ChatSessionRow,
	NoteSuggestion,
	ChatStore,
	ProjectSettings,
	ProviderCatalog,
	ProviderSettings,
	SessionNotes,
	SessionRole,
} from "./store";
import { noteSuggestions, sharedNoteIds, SUGGEST_HOW } from "./note-suggestions";
import {
	createWorktree,
	createWorktreeAsync,
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

/**
 * One device watching a session. `n` numbers each event in the journal, for catching up after a
 * drop; an event that is not part of the journal (the agent's command list) carries none.
 */
export type ChatClient = {
	event: (event: ChatEvent, n?: number) => void;
	state: (state: { running: boolean }) => void;
	/** False while the device has the app in the background; unset means it is looking. */
	watching?: () => boolean;
};

/**
 * Called when an agent waits for approval or its approval is answered, watched or not, and when a
 * turn ends while no device is looking at the chat. `watched` says whether one was.
 */
export type AttentionListener = (
	session: ChatSessionRow,
	event: ChatEvent,
	watched: boolean,
) => void;

/**
 * Where a device got to in a session's live events: which run of the runner (`epoch`, new each
 * time a session is loaded) and the number of the next event it has not seen.
 */
export type ChatCursor = { epoch: string; next: number };

// Recent live events kept per session, so a device back from the background gets only what it
// missed. Streamed text arrives in many small pieces, hence the generous count.
const JOURNAL_LIMIT = 20_000;
/** Messages that may wait for an agent at once. */
const MAX_QUEUE = 20;
/**
 * Messages a device is sent when it opens a thread, with what followed each; earlier ones come a
 * page at a time as the reader scrolls up. A long thread opened in full was slow on phones.
 */
export const HISTORY_TURNS = 20;

type Live = {
	agent: Promise<AgentSession> | null;
	clients: Set<ChatClient>;
	epoch: string;
	/**
	 * The commands the agent last reported, kept beside the session rather than in its log: a
	 * device that attaches is sent the current list, and a session that never reported one has
	 * none. Null until the agent says.
	 */
	commands: AgentCommand[] | null;
	/** The last events sent to devices, numbered from `journalStart`. */
	journal: ChatEvent[];
	journalStart: number;
	running: boolean;
	/** Streamed text not yet written: consecutive deltas become one log entry. */
	buffered: Extract<ChatEvent, { type: "message" | "reasoning" }> | null;
	flushTimer: ReturnType<typeof setTimeout> | undefined;
	idleTimer: ReturnType<typeof setTimeout> | undefined;
	/** What kind each tool call is, for answering a permission request about it. */
	toolKinds?: Map<string, ToolKind>;
	/** The skills index the current agent process was last given, and which process that was. */
	skillsSent?: { to: Promise<AgentSession>; index: string };
	/** Messages sent while the agent worked, in the order they go once it is done. */
	queue: QueuedMessage[];
	/** The queue waits for the person: the last turn was stopped or failed. */
	paused: boolean;
	/** The turn was stopped to take a steer the agent could not take mid-turn: the queue goes on. */
	steering?: boolean;
	/** Visuals shown in the turn going on, against `VISUALS_PER_TURN`. */
	visuals?: number;
	/** When the agent last did anything (wrote, used a tool, asked): for spotting a stuck turn. */
	activeAt?: number;
};

/** What a queue can be told to do (the composer's queued messages). */
export type QueueAction = "remove" | "clear" | "pause" | "resume" | "steer";

/**
 * One of Grid's own tools for agents, served by `grid-tools.ts`: what the agent is told, the
 * arguments it takes (JSON Schema), and what it does for a thread. Its answer is text for the agent.
 */
export type GridTool = {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
	/** Whether a thread's agent gets it; every thread's does when left out. */
	offered?: (session: ChatSessionRow) => boolean;
	run: (session: ChatSessionRow, args: Record<string, unknown>) => Promise<string> | string;
};

/** How a message is sent: as usual, or while the agent works, delivered into its turn. */
export type Delivery = "send" | "steer";

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
	/** Its version, when it says (`v2.1.4`). */
	version?: string | null;
	/** Added from Settings (an ACP agent), so it can be removed there. */
	custom?: boolean;
};

/** What the runner knows about an agent beyond its info: its version, and whether it was added. */
export type DescribeAgent = (
	id: string,
	installed: boolean,
) => Promise<{ version: string | null; custom: boolean }>;

function merge(
	info: ProviderInfo,
	catalog: ProviderCatalog,
): Pick<ProviderInfo, "models" | "modes"> {
	return {
		models: catalog.models.length ? catalog.models : info.models,
		modes: catalog.modes ?? info.modes,
	};
}

/** An approval waiting in a running thread, as the console's notifications show it. */
export type Waiting = {
	sessionId: string;
	project: string;
	thread: string;
	provider: string;
	approval: { id: string; title: string; detail: string | null; options: ApprovalOption[] };
};

export type RunActivity = {
	id: string;
	project: string;
	title: string;
	provider: string;
	running: boolean;
	waiting: boolean;
	startedAt: string | null;
	endedAt: string | null;
	result: "done" | "cancelled" | "error" | null;
	tool: string | null;
	steps: { done: number; total: number } | null;
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

/**
 * What the agent is actually sent. A command the menu listed as `/<agent>:<name>` — because its
 * name is one of Grid's — is the agent's own command, so the prefix Grid added goes before the
 * agent ever sees it. Everything else is the text as typed.
 */
export function agentPromptText(provider: string, text: string): string {
	const prefix = `/${provider}:`;
	return text.startsWith(prefix) ? `/${text.slice(prefix.length)}` : text;
}

/**
 * A thread's first message as the agent gets it when the thread was started as a role: who it is
 * on the team and what the team asked of that role, then the message. The transcript keeps only
 * what the person typed.
 */
export function withRoleBrief(role: SessionRole, text: string): string {
	const brief = role.brief.trim();
	const about = brief
		? `You are working as the team's ${role.name}. What this role does:\n${brief}`
		: `You are working as the team's ${role.name}.`;
	return `${about}\n\n---\n\n${text}`;
}

/**
 * The same for the notes the project shares with agents: what the team keeps there (rules,
 * decisions, a brief), then the message.
 */
export function withSharedNotes(notes: SessionNotes, text: string): string {
	const shared = notes.text.trim();
	if (!shared) return text;
	// Notes that carry their ids can take a suggested addition; older ones are only read.
	const how = sharedNoteIds(shared).size > 0 ? `\n\n${SUGGEST_HOW}` : "";
	return `Notes the team shares with agents working on this project. Follow them unless the message says otherwise:\n\n${shared}${how}\n\n---\n\n${text}`;
}

function isDirectory(path: string): boolean {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

/**
 * Whether this person may start an agent here: the workspace can keep an agent to its admins
 * (Settings → Members → Agents).
 */
export function assertMayStart(who: Who, provider: string, name: string): void {
	if (!may(who, "startAgents")) throw new ChatError(NOT_ALLOWED, 403);
	if (who.settings?.agentAccess?.[provider] === "admins" && who.role && !isAdmin(who))
		throw new ChatError(`Only admins can start ${name} in this workspace`, 403);
}

/** Whether a thread has had a message (not a command) the agent finished a turn on. */
function answeredMessage(events: readonly ChatEvent[]): boolean {
	let message = false;
	for (const event of events) {
		if (event.type === "user") message = !event.text.trimStart().startsWith("/");
		else if (event.type === "turn_end" && event.reason === "done" && message) return true;
	}
	return false;
}

/** A person's setup for their agents: environment for the process, a note for the first message. */
export type PersonalSetup = (ownerId: string) => {
	env: Record<string, string>;
	note: string | null;
};

/**
 * Every chat session: starting the agent when it is first needed, logging what it does, fanning
 * events out to each attached device, and parking agents nobody is using.
 */
// How long Grid's own question in a thread waits for an answer before it is a no.
const ASK_MS = 10 * 60_000;

export class ChatHub {
	private readonly live = new Map<string, Live>();
	private attention: AttentionListener | null = null;
	private failedTurn: ((session: ChatSessionRow) => void) | null = null;
	private readonly turnEnded: ((
		session: ChatSessionRow,
		reason: "done" | "cancelled" | "error",
	) => void)[] = [];
	private personal: PersonalSetup = () => ({ env: {}, note: null });
	private mcp: (workspace: string, agent: string, thread: string) => McpServerSpec[] = () => [];
	private skills: (workspace: string, project: string) => Promise<string> | string = () => "";
	/** Grid's own questions waiting in threads, by their approval id. */
	private readonly asks = new Map<
		string,
		{ thread: string; answer: (optionId: string | null) => void }
	>();
	private describe: DescribeAgent = async () => ({ version: null, custom: false });
	/** Grid's own tools for agents (`grid-tools.ts`): where the runner is, and the key they prove with. */
	private tools: { url: () => string; key: string } | null = null;
	private readonly gridTools = new Map<string, GridTool>();
	/** How many agents may work at once on this machine; the rest wait their turn. */
	private turnLimit = Number.POSITIVE_INFINITY;
	private turnsRunning = 0;
	private readonly turnQueue: (() => void)[] = [];
	private busyListener: ((running: number) => void) | null = null;
	private workspacePolicy: (workspace: string) => { policy: AgentPolicy; defaultBranch: string } =
		() => ({ policy: DEFAULT_POLICY, defaultBranch: "main" });

	constructor(
		private readonly store: ChatStore,
		private readonly providers: Map<string, Provider>,
		private readonly projectsDir: string = join(homedir(), "Projects"),
	) {}

	/**
	 * Clears threads (transcripts and their attachments) untouched for `days` days, as the
	 * workspace's run-log retention asks; a thread in use or with a worktree stays. Returns how
	 * many went.
	 */
	prune(workspace: string, days: number, now: number = Date.now()): number {
		if (!(days > 0)) return 0;
		const before = new Date(now - days * 86_400_000).toISOString();
		let cleared = 0;
		for (const id of this.store.idleSince(workspace, before)) {
			if (this.live.has(id)) continue;
			this.store.delete(id);
			cleared++;
		}
		return cleared;
	}

	/** How many people have used each agent in a workspace. */
	agentUsage(workspace: string): Record<string, number> {
		return this.store.agentUsage(workspace);
	}

	/** How many agents may work at the same time (Settings → Machines); 0 or less is no limit. */
	setTurnLimit(limit: number): void {
		this.turnLimit = limit > 0 ? limit : Number.POSITIVE_INFINITY;
		while (this.turnQueue.length && this.turnsRunning < this.turnLimit) {
			this.turnsRunning++;
			this.turnQueue.shift()?.();
		}
	}

	/** Hears how many agents are working whenever that changes (to keep the machine awake). */
	onBusy(listener: (running: number) => void): void {
		this.busyListener = listener;
	}

	/** How many agents are working now, in every workspace. */
	busyCount(): number {
		return [...this.live.values()].filter((live) => live.running).length;
	}

	private takeTurn(): Promise<void> {
		if (this.turnsRunning < this.turnLimit) {
			this.turnsRunning++;
			return Promise.resolve();
		}
		return new Promise((resolve) => this.turnQueue.push(resolve));
	}

	private endTurn(): void {
		const next = this.turnQueue.shift();
		if (next) next();
		else this.turnsRunning = Math.max(0, this.turnsRunning - 1);
	}

	/** Each agent's version and whether it was added from Settings, for the agents list. */
	setDescribe(describe: DescribeAgent): void {
		this.describe = describe;
	}

	/** What agents may do on their own in each workspace (Settings → Agents & permissions). */
	setPolicy(policy: (workspace: string) => { policy: AgentPolicy; defaultBranch: string }): void {
		this.workspacePolicy = policy;
	}

	/** Threads in a workspace whose title or messages mention any of the words (Search, Ask Grid). */
	searchThreads(workspace: string, words: readonly string[], limit?: number) {
		return this.store.searchText(workspace, words, limit);
	}

	/**
	 * A question an agent answers once, outside any thread (Ask Grid): nothing is kept but the
	 * answer. It is to answer from what it is given, so any tool it asks for is declined.
	 */
	async answerOnce(
		input: { provider: string; cwd: string; prompt: string; model?: string },
		timeoutMs = 120_000,
	): Promise<string> {
		const provider = this.providers.get(input.provider);
		if (!provider?.info().available)
			throw new ChatError("That agent is not installed on this machine", 400);
		let text = "";
		let session: AgentSession | null = null;
		session = await provider.start({
			cwd: input.cwd,
			...(input.model ? { model: input.model } : {}),
			emit: (event) => {
				if (event.type === "message") text += event.text;
				else if (event.type === "approval") {
					const deny = event.options.find((option) => option.kind === "deny");
					session?.approve(event.id, deny?.id ?? null);
				}
			},
			onResumeToken: () => {},
		});
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			const result = await Promise.race([
				session.prompt(input.prompt),
				new Promise<never>((_, reject) => {
					timer = setTimeout(
						() => reject(new ChatError("The agent took too long to answer", 504)),
						timeoutMs,
					);
				}),
			]);
			if (result.reason === "error")
				throw new ChatError(result.error ?? "The agent could not answer", 502);
			return text;
		} finally {
			clearTimeout(timer);
			session.close();
		}
	}

	/** The MCP servers a thread's agent starts with: the workspace's connectors it may use. */
	setMcp(servers: (workspace: string, agent: string, thread: string) => McpServerSpec[]): void {
		this.mcp = servers;
	}

	/**
	 * Give each thread's agent Grid's own tools (`grid-tools.ts`), which call back to the runner at
	 * `url` with a key made here. `show_visual` is always among them; others are registered.
	 */
	setGridTools(url: () => string): void {
		this.tools = { url, key: crypto.randomUUID() };
		this.registerTool({
			name: "show_visual",
			description: SHOW_VISUAL_DESCRIPTION,
			inputSchema: SHOW_VISUAL_SCHEMA,
			run: (session, args) => {
				this.showVisual(session.id, args);
				return "Shown to the reader above your reply. Do not describe it or say where it is; state the key finding in words.";
			},
		});
	}

	/** Add one of Grid's tools; `offered` says which threads get it (all, when left out). */
	registerTool(tool: GridTool): void {
		this.gridTools.set(tool.name, tool);
	}

	private checkTools(key: string, thread: string): ChatSessionRow {
		if (!this.tools || key !== this.tools.key) throw new ChatError("Not one of Grid's tools", 401);
		const session = this.store.get(thread);
		if (!session) throw new ChatError("That chat does not exist", 404);
		return session;
	}

	/** The tools a thread's agent is offered, as its MCP server lists them. */
	toolsFor(key: string, thread: string): Pick<GridTool, "name" | "description" | "inputSchema">[] {
		const session = this.checkTools(key, thread);
		return [...this.gridTools.values()]
			.filter((tool) => tool.offered?.(session) ?? true)
			.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
	}

	/** Run one of Grid's tools for a thread's agent: its answer, or a ChatError saying why not. */
	async callTool(
		key: string,
		thread: string,
		name: string,
		args: Record<string, unknown>,
	): Promise<string> {
		const session = this.checkTools(key, thread);
		const tool = this.gridTools.get(name);
		if (!tool || !(tool.offered?.(session) ?? true))
			throw new ChatError(`Grid has no tool called ${name} here`, 404);
		try {
			return await tool.run(session, args);
		} catch (cause) {
			if (cause instanceof ChatError) throw cause;
			throw new ChatError(cause instanceof Error ? cause.message : String(cause), 502);
		}
	}

	/** Grid's tools as an MCP server for one thread, when they are on. */
	private gridServer(thread: string): McpServerSpec[] {
		if (!this.tools) return [];
		return [
			{
				name: "grid",
				command: process.execPath,
				args: [join(import.meta.dir, "grid-tools.ts")],
				env: {
					GRID_RUNNER_URL: this.tools.url(),
					GRID_TOOLS_KEY: this.tools.key,
					GRID_TOOLS_THREAD: thread,
				},
			},
		];
	}

	/** A visual an agent shows through `show_visual`, into the turn it is working on. */
	private showVisual(thread: string, args: Record<string, unknown>): void {
		const live = this.live.get(thread);
		if (!live?.running)
			throw new ChatError("A visual can only be shown while you are answering", 409);
		if ((live.visuals ?? 0) >= VISUALS_PER_TURN)
			throw new ChatError(`At most ${VISUALS_PER_TURN} visuals in one turn`, 429);
		let visual: ReturnType<typeof readVisual>;
		try {
			visual = readVisual(args);
		} catch (cause) {
			if (cause instanceof VisualError) throw new ChatError(cause.message, 400);
			throw cause;
		}
		live.visuals = (live.visuals ?? 0) + 1;
		this.record(thread, { type: "visual", id: crypto.randomUUID(), ...visual });
	}

	/** Enabled workspace and project skills, added to each provider's message context. */
	setSkills(context: (workspace: string, project: string) => Promise<string> | string): void {
		this.skills = context;
	}

	/** Every provider accepts text messages; Grid supplies skills in that shared context. */
	skillProviders(): {
		id: string;
		name: string;
		available: boolean;
		delivery: "message-context";
	}[] {
		return [...this.providers.values()].map((provider) => {
			const { id, name, available } = provider.info();
			return { id, name, available, delivery: "message-context" };
		});
	}

	/**
	 * A question Grid itself puts in a thread (a connector's tool set to "Ask me"), shown and
	 * answered like an agent's request. Unanswered in ten minutes, it is a no.
	 */
	ask(thread: string, question: { title: string; detail?: string }): Promise<boolean> {
		if (!this.store.get(thread)) return Promise.resolve(false);
		const id = `grid-${crypto.randomUUID()}`;
		return new Promise((resolve) => {
			const timer = setTimeout(() => answer(null), ASK_MS);
			const answer = (optionId: string | null) => {
				clearTimeout(timer);
				if (!this.asks.delete(id)) return;
				this.record(thread, { type: "approval_resolved", id, optionId });
				resolve(optionId === "allow");
			};
			this.asks.set(id, { thread, answer });
			this.record(thread, {
				type: "approval",
				id,
				title: question.title,
				...(question.detail ? { detail: question.detail } : {}),
				options: [
					{ id: "allow", label: "Allow", kind: "allow" },
					{ id: "deny", label: "Deny", kind: "deny" },
				],
			});
		});
	}

	/** What each person's agents start with: their git identity, and a note for the first message. */
	setPersonal(setup: PersonalSetup): void {
		this.personal = setup;
	}

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
				return {
					...info,
					...(await this.describe(id, info.available)),
					settings: settings[id] ?? {},
					setup: await setupOf(id, info.available),
				};
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

	/**
	 * Hear about approvals that wait and the answers they get, whoever is watching, and about turns
	 * that end while nobody is watching the chat.
	 */
	onAttention(listener: AttentionListener): void {
		this.attention = listener;
	}

	/** Hear about every turn that ends, after it has: how it ended. */
	onTurnEnded(
		listener: (session: ChatSessionRow, reason: "done" | "cancelled" | "error") => void,
	): void {
		this.turnEnded.push(listener);
	}

	/** Whether a thread's agent is working now. */
	isRunning(id: string): boolean {
		return this.live.get(id)?.running ?? false;
	}

	/** When a thread's agent last did anything in the turn going on (ms), or null. */
	lastActivity(id: string): number | null {
		return this.live.get(id)?.activeAt ?? null;
	}

	/** Whether a thread's turn waits on a person: an approval or a question nobody has answered. */
	waitsOnPerson(id: string): boolean {
		const open = new Set<string>();
		for (const event of this.store.eventsFromLast(id, "turn_start")) {
			if (event.type === "approval" || event.type === "question") open.add(event.id);
			else if (event.type === "approval_resolved" || event.type === "question_answered")
				open.delete(event.id);
		}
		return open.size > 0;
	}

	/** What the agent said in a thread's last turn, for reporting it elsewhere. */
	lastReply(id: string): string {
		return this.store
			.eventsFromLast(id, "turn_start")
			.map((event) => (event.type === "message" ? event.text : ""))
			.join("")
			.trim();
	}

	/** Hear about every turn that ends in an error, once per turn, watched or not. */
	onTurnFailed(listener: (session: ChatSessionRow) => void): void {
		this.failedTurn = listener;
	}

	/** The workspace's threads with an agent working right now, for the "running" indicators. */
	running(workspace: string): { id: string; project: string }[] {
		return [...this.live]
			.filter(([, live]) => live.running)
			.map(([id]) => this.store.get(id))
			.filter((row): row is ChatSessionRow => row?.workspaceId === workspace)
			.map((row) => ({ id: row.id, project: row.project }));
	}

	/**
	 * What is waiting on a person across the workspace: each running thread's approvals that nobody
	 * has answered yet, for the console's notifications.
	 */
	waiting(workspace: string): Waiting[] {
		const found: Waiting[] = [];
		for (const { id } of this.running(workspace)) {
			const row = this.store.get(id);
			if (!row) continue;
			const open = new Map<string, Extract<ChatEvent, { type: "approval" }>>();
			// An approval is open from when it is asked until it is answered or its turn ends.
			for (const event of this.store.eventsFromLast(id, "turn_end")) {
				if (event.type === "approval") open.set(event.id, event);
				else if (event.type === "approval_resolved") open.delete(event.id);
				else if (event.type === "turn_end") open.clear();
			}
			for (const approval of open.values())
				found.push({
					sessionId: id,
					project: row.project,
					thread: row.title,
					provider: row.provider,
					approval: {
						id: approval.id,
						title: approval.title,
						detail: approval.detail ?? null,
						options: approval.options,
					},
				});
		}
		return found;
	}

	/** Latest run per active or question thread, plus 40 recent idle threads in a project. */
	activity(workspace: string, project: string): RunActivity[] {
		const questions = new Set([...this.asks.values()].map((ask) => ask.thread));
		let idle = 0;
		return this.store
			.list(workspace, project)
			.filter((row) => this.live.get(row.id)?.running || questions.has(row.id) || idle++ < 40)
			.map((row) => {
				const turn = this.store.eventsFromLast(row.id, "turn_start");
				const began = turn.find((event) => event.type === "turn_start");
				const end = turn.findLast((event) => event.type === "turn_end");
				const plan = turn.findLast((event) => event.type === "plan");
				const tool = turn.findLast((event) => event.type === "tool" && event.title);
				const pending = new Set<string>();
				for (const event of turn) {
					if (event.type === "approval") pending.add(event.id);
					else if (event.type === "approval_resolved") pending.delete(event.id);
					else if (event.type === "turn_end") pending.clear();
				}
				return {
					id: row.id,
					project: row.project,
					title: row.title,
					provider: row.provider,
					running: this.live.get(row.id)?.running ?? false,
					waiting: pending.size > 0,
					startedAt: began?.type === "turn_start" ? (began.at ?? null) : null,
					endedAt: end?.type === "turn_end" ? (end.at ?? row.updatedAt) : null,
					result: end?.type === "turn_end" ? end.reason : null,
					tool: tool?.type === "tool" ? (tool.title ?? null) : null,
					steps:
						plan?.type === "plan"
							? {
									done: plan.entries.filter((item) => item.status === "completed").length,
									total: plan.entries.length,
								}
							: null,
				};
			});
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

	/** Whether this runner has an agent by that id (installed or not). */
	knowsProvider(id: string): boolean {
		return this.providers.has(id);
	}

	/** Every workspace with work kept here. */
	workspaces(): string[] {
		return this.store.workspaces();
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
			/** The role it is started as (see `SessionRole`). */
			role?: SessionRole | null;
			/** The project's shared notes it starts with (see `SessionNotes`). */
			notes?: SessionNotes | null;
			/** A side chat's thread (see `side`). */
			parentId?: string | null;
		},
	): ChatSessionRow {
		const provider = this.providers.get(input.provider);
		if (!provider?.info().available)
			throw new ChatError("That agent is not installed on this machine", 400);
		assertMayStart(who, input.provider, provider.info().name);
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
					from: who.settings?.defaultBranch,
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
			role: input.role ?? null,
			notes: input.notes?.text.trim() ? { text: input.notes.text } : null,
			parentId: input.parentId ?? null,
		});
	}

	/** Create an unattended run without synchronous filesystem or git work on the event loop. */
	async createAutomation(
		who: Who,
		input: {
			project: string;
			provider: string;
			model?: string;
			mode?: string;
			effort?: string;
			worktree: boolean;
			/** The branch its worktree starts from; what is checked out when not given. */
			base?: string;
			/** The role it runs as. */
			role?: SessionRole | null;
		},
	): Promise<ChatSessionRow> {
		const provider = this.providers.get(input.provider);
		if (!provider?.info().available)
			throw new ChatError("That agent is not installed on this machine", 400);
		const linked = this.store.projectFolders(who.workspace)[input.project];
		const directory = linked
			? await stat(linked).then(
					(entry) => entry.isDirectory(),
					() => false,
				)
			: false;
		if (!linked || !directory)
			throw new ChatError("Choose this project's folder first: chats work inside it.", 409);
		const root = await realpath(this.projectsDir);
		const boundedCwd = await realpath(linked);
		const inside = relative(root, boundedCwd);
		if (inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside))
			throw new ChatError("Project folder must be inside the projects directory", 400);
		const id = crypto.randomUUID();
		let own: Awaited<ReturnType<typeof createWorktreeAsync>> = null;
		if (input.worktree) {
			try {
				own = await createWorktreeAsync(boundedCwd, id, root, input.base);
			} catch (cause) {
				if (cause instanceof WorktreeError) throw new ChatError(cause.message, cause.status);
				throw cause;
			}
			if (!own) throw new ChatError("This project folder is not in a git repository", 409);
		}
		return this.store.create({
			id,
			ownerId: who.userId,
			workspaceId: who.workspace,
			project: input.project,
			provider: input.provider,
			title: "New chat",
			cwd: own?.cwd ?? boundedCwd,
			model: input.model ?? null,
			mode: input.mode ?? provider.info().defaultMode ?? null,
			effort: input.effort ?? null,
			worktree: own?.worktree ?? null,
			role: input.role ?? null,
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
		// As `discardWorktree` does: the turn still in flight would keep writing into a row that
		// no longer exists (its events are gone with it, `turn_end` among them), and the worktree
		// below is removed while the agent may still be working in it.
		if (this.live.get(id)?.running) throw new ChatError("Stop the agent first", 409);
		// Its side chats go with it; one still answering keeps the thread until it is stopped.
		const sides = this.store.sides(id);
		if (sides.some((side) => this.live.get(side.id)?.running))
			throw new ChatError("Stop its side chat first", 409);
		for (const side of sides) {
			this.park(side.id);
			this.store.delete(side.id);
		}
		this.park(id);
		// Its checkpoints are refs in the repository the thread worked in, which outlives it.
		void dropCheckpoints(session.worktree?.origin ?? session.cwd, id).catch((cause: unknown) => {
			console.warn(
				"[runner] could not forget a deleted chat's checkpoints:",
				cause instanceof Error ? cause.message : cause,
			);
		});
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
		/** The latest part of the log (see `HISTORY_TURNS`); empty when catching up. */
		history: ChatEvent[];
		/** Where the history before `history` ends, to ask `earlierEvents` for; null when none. */
		earlier: number | null;
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
		// The list is not in the log, so it is sent here as well as when it changes.
		if (live.commands) client.event({ type: "commands", commands: live.commands });
		// Nor is the queue: a device that attaches is told what is waiting.
		if (live.queue.length || live.paused)
			client.event({ type: "queue", items: live.queue, paused: live.paused });
		const recent = canResume
			? { events: [], earlier: null }
			: this.store.recentEvents(id, HISTORY_TURNS);
		return {
			session,
			history: recent.events,
			earlier: recent.earlier,
			missed: canResume ? live.journal.slice(resume.next - live.journalStart) : null,
			running: live.running,
			cursor: { epoch: live.epoch, next: end },
			detach: () => {
				live.clients.delete(client);
			},
		};
	}

	/** A page of a thread's history from before `before`: the same window `attach` sends. */
	earlierEvents(
		workspace: string,
		id: string,
		before: number,
	): { events: ChatEvent[]; earlier: number | null } {
		this.owned(workspace, id);
		return this.store.recentEvents(id, HISTORY_TURNS, before);
	}

	checkSession(workspace: string, id: string): void {
		this.owned(workspace, id);
	}

	upload(workspace: string, id: string, name: string, bytes: Uint8Array): Attachment {
		this.owned(workspace, id);
		if (bytes.length > MAX_ATTACHMENT_BYTES)
			throw new ChatError("Each file must be 10 MB or smaller", 413);
		const usage = this.store.attachmentUsage(id);
		if (usage.count >= MAX_SESSION_ATTACHMENTS || usage.bytes + bytes.length > MAX_SESSION_BYTES)
			throw new ChatError("This thread holds as many files as it can; start a new thread", 413);
		const safeName =
			name
				.replaceAll("\\", "/")
				.split("/")
				.at(-1)
				?.replace(/[\x00-\x1f\x7f]/g, "")
				.slice(0, 200) || "file";
		const attachment = {
			id: crypto.randomUUID(),
			name: safeName,
			size: bytes.length,
			mimeType: imageType(bytes) ?? "application/octet-stream",
		};
		this.store.addAttachment(id, attachment, bytes);
		return attachment;
	}

	attachment(workspace: string, id: string, attachmentId: string) {
		this.owned(workspace, id);
		const metadata = this.store.attachment(id, attachmentId);
		if (!metadata) throw new ChatError("Attachment not found", 404);
		try {
			return { metadata, ...this.store.attachmentFiles.read(id, metadata) };
		} catch {
			throw new ChatError("Attachment is no longer available", 404);
		}
	}

	/** A thread's files by id, checked to be still there, with where each is on this machine. */
	private resolveAttachments(id: string, attachmentIds: unknown) {
		if (
			!Array.isArray(attachmentIds) ||
			attachmentIds.length > MAX_ATTACHMENTS ||
			attachmentIds.some((value) => typeof value !== "string") ||
			new Set(attachmentIds).size !== attachmentIds.length
		)
			throw new ChatError("Send up to 20 attachment ids", 400);
		return attachmentIds.map((attachmentId) => {
			const metadata = this.store.attachment(id, attachmentId);
			if (!metadata) throw new ChatError("Attachment not found", 404);
			try {
				return { metadata, path: this.store.attachmentFiles.verifiedPath(id, metadata) };
			} catch {
				throw new ChatError("Attachment is no longer available", 404);
			}
		});
	}

	/** Images the agent can take inline, within what a model accepts; the rest go by path. */
	private inlineImages(
		id: string,
		attachments: { metadata: Attachment; path: string }[],
	): { mimeType: string; data: string }[] {
		const images: { mimeType: string; data: string }[] = [];
		let inline = 0;
		for (const item of attachments) {
			const { mimeType, size } = item.metadata;
			if (!mimeType.startsWith("image/") || size > MAX_IMAGE_BLOCK_BYTES) continue;
			if (inline + size > MAX_IMAGE_BLOCKS_BYTES) continue;
			inline += size;
			try {
				const { bytes } = this.store.attachmentFiles.read(id, item.metadata);
				images.push({ mimeType, data: bytes.toString("base64") });
			} catch {
				throw new ChatError("Attachment is no longer available", 404);
			}
		}
		return images;
	}

	/**
	 * Send a message. While the agent works, it waits in the thread's queue and goes when the turn
	 * is done, unless `delivery` is `steer`: then it goes into the turn going on (or, for an agent
	 * that cannot take one mid-turn, the turn is stopped and it goes next).
	 */
	async prompt(
		workspace: string,
		id: string,
		text: string,
		attachmentIds: unknown = [],
		delivery: Delivery = "send",
	): Promise<void> {
		const session = this.owned(workspace, id);
		const live = this.liveFor(id);
		const message = text.trim();
		const attachments = this.resolveAttachments(id, attachmentIds);
		if (!message && !attachments.length) return;
		// Before any image is read: a message sent while the agent works only waits.
		if (live.running) {
			if (delivery === "steer") return this.steer(id, live, message, attachments);
			if (live.queue.length >= MAX_QUEUE)
				throw new ChatError(`At most ${MAX_QUEUE} messages can wait; remove one first`, 409);
			live.queue.push({
				id: crypto.randomUUID(),
				text: message,
				...(attachments.length ? { attachments: attachments.map((item) => item.metadata) } : {}),
			});
			this.publishQueue(id, live);
			return;
		}
		// Someone sending by hand is ready again: a queue held after a stop goes on after this.
		if (live.paused) {
			live.paused = false;
			this.publishQueue(id, live);
		}
		const images = this.inlineImages(id, attachments);

		if (session.title === "New chat") {
			this.store.update(id, {
				title: (message || attachments[0]?.metadata.name || "Chat")
					.replace(/\s+/g, " ")
					.slice(0, 60),
			});
		}
		// The thread as it was before this message, for an agent that has to be told it.
		const earlier = this.store.events(id);
		this.record(id, {
			type: "user",
			id: crypto.randomUUID(),
			text: message,
			...(attachments.length ? { attachments: attachments.map((item) => item.metadata) } : {}),
		});
		// An agent opened without a session to resume (a thread restored from another machine, a
		// fork, or one whose session was cleared) has no memory of the turns before: it is told
		// them, once, and the notes a first message carries.
		const opensFresh = !live.agent && !session.resumeToken && answeredMessage(earlier);
		const firstTurn = !answeredMessage(this.store.events(id)) || opensFresh;
		this.setRunning(id, live, true);
		live.visuals = 0;
		const turn = this.store.count(id, "turn_start") + 1;
		this.record(id, { type: "turn_start", at: new Date().toISOString() });
		const cwd = this.store.get(id)?.cwd ?? session.cwd;
		// The files as the turn finds them, kept before the agent can change any.
		const before = snapshot(cwd, checkpointRef(id, turn, "start")).catch((cause: unknown) => {
			console.warn(
				"[runner] could not checkpoint a turn:",
				cause instanceof Error ? cause.message : cause,
			);
			return null;
		});

		let result: Awaited<ReturnType<AgentSession["prompt"]>>;
		let briefRole = false;
		let briefNotes = false;
		const opening = this.agentFor(session, live);
		try {
			const agent = await opening;
			const paths = attachments
				.map((item) => `${JSON.stringify(item.metadata.name)}: ${JSON.stringify(item.path)}`)
				.join("\n");
			// An agent command the menu prefixed is the agent's own command, sent as it typed.
			const typed = agentPromptText(session.provider, message);
			// A thread started as a role gives the agent its brief with the first message that gets
			// through, and the project's shared notes the same way. A command goes as typed (the agent
			// would not read it as one after a brief), and the brief waits for the next message.
			const command = typed.startsWith("/");
			briefRole = Boolean(session.role && !session.role.briefed && !command);
			briefNotes = Boolean(session.notes && !session.notes.briefed && !command);
			let text = typed;
			const rules = this.workspacePolicy(session.workspaceId);
			const note =
				firstTurn && !command
					? [this.personal(session.ownerId).note, branchNote(rules.policy, rules.defaultBranch)]
							.filter(Boolean)
							.join("\n\n") || null
					: null;
			if (note) text = `${note}\n\n---\n\n${text}`;
			if (briefNotes && session.notes) text = withSharedNotes(session.notes, text);
			if (briefRole && session.role) text = withRoleBrief(session.role, text);
			// A thread handed to this agent says so: it carries on someone else's work.
			const handoff = earlier.findLast((event) => event.type === "handoff");
			const takesOver =
				handoff?.type === "handoff" &&
				earlier.lastIndexOf(handoff) > earlier.findLastIndex((event) => event.type === "user");
			const intro = takesOver
				? `You are taking over this thread from ${this.providerName(handoff.from.provider)}. Here is the conversation so far, oldest first; your messages in it were that agent's:`
				: undefined;
			const history = opensFresh && !command ? historyBrief(earlier, undefined, intro) : null;
			if (history) text = `${history}\n\n---\n\n${text}`;
			const prompt = paths
				? `${text}\n\nAttached files (absolute paths on this machine):\n${paths}`
				: text;
			// The skills index goes to each agent process once, and again only when it changes: the
			// agent keeps it in its own context, so repeating it every turn would only cost tokens.
			const index = command ? null : await this.skills(session.workspaceId, session.project);
			const sent = live.skillsSent?.to === opening ? live.skillsSent.index : "";
			const skillsNote =
				index === null || index === sent
					? ""
					: index || "The Grid skills listed earlier in this conversation are no longer enabled.";
			const contextualPrompt = skillsNote ? `${skillsNote}\n\n---\n\n${prompt}` : prompt;
			await this.takeTurn();
			try {
				await before;
				result = await agent.prompt(contextualPrompt, images);
			} finally {
				this.endTurn();
			}
			if (index !== null && result.reason !== "error") live.skillsSent = { to: opening, index };
		} catch (cause) {
			result = { reason: "error", error: cause instanceof Error ? cause.message : String(cause) };
			// A failed start leaves nothing to reuse, but only if this is still the start that
			// failed: the chat may have been parked and prompted again while it was in flight, and
			// clearing then dropped the live agent, which nothing was left to close.
			if (live.agent === opening) live.agent = null;
		}
		if (result.reason !== "error") {
			if (briefRole && session.role)
				this.store.update(id, { role: { ...session.role, briefed: true } });
			if (briefNotes && session.notes)
				this.store.update(id, { notes: { ...session.notes, briefed: true } });
		}
		await this.keepCheckpoint(id, cwd, turn, await before);
		const failure =
			result.reason === "error" && result.error ? this.explainFailure(session, result.error) : null;
		this.record(id, {
			type: "turn_end",
			reason: result.reason,
			error: failure?.error ?? result.error,
			...(failure ? { retryable: failure.retryable } : {}),
			at: new Date().toISOString(),
		});
		this.setRunning(id, live, false);
		this.store.touch(id);
		this.scheduleIdle(id, live);
		if (result.reason === "done") this.keepNoteSuggestions(id);
		// The model list can take a while (agy's does): the turn has ended by now, not after it.
		if (failure?.kind === "model-gone" && failure.model) {
			const model = failure.model;
			void this.forgetGoneModel(session, model, result.error ?? "").catch((cause: unknown) => {
				console.warn(
					`[runner] Could not settle the model ${model} after it was refused:`,
					cause instanceof Error ? cause.message : cause,
				);
			});
		}
		this.afterTurn(session.workspaceId, id, live, result.reason);
		const ended = this.store.get(id);
		if (ended)
			for (const listener of this.turnEnded) {
				try {
					listener(ended, result.reason);
				} catch (cause) {
					console.warn(
						"[runner] a turn-end listener failed:",
						cause instanceof Error ? cause.message : cause,
					);
				}
			}
	}

	/** The turn's checkpoint, when the turn changed files: what it changed, for Undo. */
	private async keepCheckpoint(
		id: string,
		cwd: string,
		turn: number,
		start: string | null,
	): Promise<void> {
		if (!start) return;
		try {
			const end = await snapshot(cwd, checkpointRef(id, turn, "end"));
			if (!end) return;
			const files = await changedFiles(cwd, start, end);
			if (files.length)
				this.record(id, { type: "checkpoint", turn, files, at: new Date().toISOString() });
		} catch (cause) {
			console.warn(
				"[runner] could not checkpoint a turn:",
				cause instanceof Error ? cause.message : cause,
			);
		}
	}

	/**
	 * After a turn: the next queued message goes, unless the turn was stopped or failed, which
	 * holds the queue until the person says to go on (a stop made to take a steer does not).
	 */
	private afterTurn(
		workspace: string,
		id: string,
		live: Live,
		reason: "done" | "cancelled" | "error",
	): void {
		const steered = live.steering === true;
		live.steering = false;
		if (!live.queue.length) return;
		if (reason !== "done" && !steered) {
			live.paused = true;
			this.publishQueue(id, live);
			return;
		}
		this.drain(workspace, id, live);
	}

	/** Send the first queued message, when the agent is free and the queue is not held. */
	private drain(workspace: string, id: string, live: Live): void {
		if (live.running || live.paused) return;
		const next = live.queue.shift();
		if (!next) return;
		this.publishQueue(id, live);
		const ids = (next.attachments ?? []).map((item) => item.id);
		this.prompt(workspace, id, next.text, ids).catch((cause: unknown) => {
			// It could not go (a file it carried is gone): it waits again, at the front, held.
			live.queue.unshift(next);
			live.paused = true;
			this.publishQueue(id, live);
			this.record(id, {
				type: "error",
				message: `A queued message could not be sent: ${cause instanceof Error ? cause.message : String(cause)}`,
			});
		});
	}

	/**
	 * A message into the turn going on. The agent takes it mid-turn when it can; otherwise the
	 * turn is stopped and the message goes first once it has, the queue carrying on after it.
	 */
	private async steer(
		id: string,
		live: Live,
		message: string,
		attachments: { metadata: Attachment; path: string }[],
	): Promise<void> {
		const item: QueuedMessage = {
			id: crypto.randomUUID(),
			text: message,
			...(attachments.length ? { attachments: attachments.map((entry) => entry.metadata) } : {}),
		};
		const agent = live.agent ? await live.agent.catch(() => null) : null;
		if (agent?.steer && live.running) {
			const paths = attachments
				.map((entry) => `${JSON.stringify(entry.metadata.name)}: ${JSON.stringify(entry.path)}`)
				.join("\n");
			const text = paths
				? `${message}\n\nAttached files (absolute paths on this machine):\n${paths}`
				: message;
			const taken = await agent.steer(text, this.inlineImages(id, attachments)).catch(() => false);
			if (taken) {
				this.record(id, {
					type: "steer",
					text: message,
					...(attachments.length
						? { attachments: attachments.map((entry) => entry.metadata) }
						: {}),
				});
				return;
			}
		}
		// Not taken: it goes first, once this turn is over.
		live.queue.unshift(item);
		live.paused = false;
		this.publishQueue(id, live);
		if (!live.running) {
			this.drain(this.store.get(id)?.workspaceId ?? "", id, live);
			return;
		}
		// An agent that cannot take a message mid-turn is stopped, so the message goes now.
		if (agent && !agent.steer) {
			live.steering = true;
			agent.cancel();
		}
	}

	/** Change a thread's queue: drop a message, hold or go on, or send one into the turn now. */
	async queueAction(
		workspace: string,
		id: string,
		action: QueueAction,
		itemId?: string,
	): Promise<void> {
		this.owned(workspace, id);
		const live = this.liveFor(id);
		const item = itemId ? live.queue.find((entry) => entry.id === itemId) : undefined;
		if ((action === "remove" || action === "steer") && !item)
			throw new ChatError("That message is no longer waiting", 404);
		if (action === "remove" || action === "steer")
			live.queue = live.queue.filter((entry) => entry !== item);
		if (action === "clear") live.queue = [];
		if (action === "pause") live.paused = live.queue.length > 0;
		if (action === "resume" || !live.queue.length) live.paused = false;
		this.publishQueue(id, live);
		if (action === "steer" && item) {
			const ids = (item.attachments ?? []).map((entry) => entry.id);
			if (live.running) await this.steer(id, live, item.text, this.resolveAttachments(id, ids));
			else await this.prompt(workspace, id, item.text, ids);
			return;
		}
		if (action === "resume") this.drain(workspace, id, live);
	}

	/** Tell every device the queue, and keep it, so a restarted runner still has it. */
	private publishQueue(id: string, live: Live): void {
		this.store.setQueue(id, { items: live.queue, paused: live.paused });
		const event: ChatEvent = { type: "queue", items: live.queue, paused: live.paused };
		for (const client of live.clients) client.event(event);
	}

	/**
	 * Answer a question the agent asked: picked labels or typed text per question id; null
	 * dismisses it. Refused once it is no longer waiting.
	 */
	async answerQuestion(
		workspace: string,
		id: string,
		questionId: string,
		answers: Record<string, string[]> | null,
	): Promise<void> {
		this.owned(workspace, id);
		const open = new Set<string>();
		for (const event of this.store.eventsFromLast(id, "turn_start")) {
			if (event.type === "question") open.add(event.id);
			else if (event.type === "question_answered") open.delete(event.id);
		}
		if (!open.has(questionId)) throw new ChatError("That question is no longer waiting", 409);
		const live = this.live.get(id);
		const pending = live?.agent;
		if (!live?.running || !pending) throw new ChatError("The agent is no longer running", 409);
		const agent = await pending;
		if (!agent.answer) throw new ChatError("This agent cannot take answers", 409);
		agent.answer(questionId, answers);
	}

	/**
	 * Put a thread's files back to how they were before one of its turns. Refused while its agent
	 * works, or while another agent works in the same checkout: its edits would be undone too.
	 */
	async restoreCheckpoint(workspace: string, id: string, turn: number): Promise<void> {
		const session = this.owned(workspace, id);
		if (this.live.get(id)?.running) throw new ChatError("Stop the agent first", 409);
		const root = repoRoot(session.cwd);
		if (!root) throw new ChatError("This thread's folder is not in a git repository", 409);
		for (const [other, live] of this.live) {
			if (other === id || !live.running) continue;
			const row = this.store.get(other);
			if (row && repoRoot(row.cwd) === root)
				throw new ChatError(
					`Another agent is working in this folder (${row.title}); wait for it to finish`,
					409,
				);
		}
		try {
			const files = await restore(
				session.cwd,
				checkpointRef(id, turn, "start"),
				checkpointRef(id, turn, "undo"),
			);
			this.record(id, { type: "checkpoint_restored", turn, files, at: new Date().toISOString() });
		} catch (cause) {
			if (cause instanceof CheckpointError) throw new ChatError(cause.message, cause.status);
			throw cause;
		}
	}

	/**
	 * A new thread that carries on from this one: its conversation up to the end of the turn of
	 * `at` (a message id; the whole settled thread when not given), then a divider where the
	 * fork's own work begins. It works in the same folder, or in a worktree of its own. Its agent
	 * starts fresh and is told the conversation so far with its first message.
	 */
	fork(
		who: Who,
		id: string,
		input: {
			at?: string;
			worktree?: boolean;
			/** Another agent to carry on with (a handoff into a new thread), and its settings. */
			provider?: string;
			model?: string;
			mode?: string;
			effort?: string;
			/** Open it as a side chat of this thread, under this title. */
			side?: string;
		},
	): ChatSessionRow {
		const source = this.owned(who.workspace, id);
		const events = this.store.events(id);
		let end = events.length;
		if (input.at) {
			const at = events.findIndex((event) => event.type === "user" && event.id === input.at);
			if (at < 0) throw new ChatError("That message is not in this thread", 404);
			const next = events.findIndex((event, i) => i > at && event.type === "user");
			end = next < 0 ? events.length : next;
			if (!events.slice(at, end).some((event) => event.type === "turn_end"))
				throw new ChatError("Wait for that turn to finish before forking from it", 409);
		} else if (this.live.get(id)?.running) {
			// The turn going on is not settled: the fork takes what is.
			end = events.findLastIndex((event) => event.type === "turn_end") + 1;
		}
		// Checkpoints are kept under this thread's name; the fork starts its own.
		const copied = events
			.slice(0, end)
			.filter((event) => event.type !== "checkpoint" && event.type !== "checkpoint_restored");
		if (!copied.some((event) => event.type === "user"))
			throw new ChatError("There is nothing to fork yet", 409);
		const other = input.provider && input.provider !== source.provider;
		const pick = (given: string | undefined, kept: string | null) =>
			given ?? (other ? undefined : (kept ?? undefined));
		const model = pick(input.model, source.model);
		const mode = pick(input.mode, source.mode);
		const effort = pick(input.effort, source.effort);
		const row = this.create(who, {
			project: source.project,
			provider: input.provider ?? source.provider,
			cwd: source.cwd,
			...(model ? { model } : {}),
			...(mode ? { mode } : {}),
			...(effort ? { effort } : {}),
			worktree: input.worktree === true,
			role: source.role ? { ...source.role, briefed: false } : null,
			notes: source.notes ? { text: source.notes.text } : null,
			...(input.side ? { parentId: source.id } : {}),
		});
		const title = (
			input.side ??
			(other ? `${source.title} · ${this.providerName(row.provider)}` : `${source.title} · fork`)
		).slice(0, 120);
		this.store.update(row.id, { title });
		const at = new Date().toISOString();
		this.store.append(row.id, [
			...copied,
			{ type: "forked", from: { id: source.id, title: source.title }, at },
			...(other
				? [
						{
							type: "handoff",
							from: { provider: source.provider, model: source.model },
							to: { provider: row.provider, model: row.model },
							at,
						} satisfies ChatEvent,
					]
				: []),
		]);
		return { ...row, title };
	}

	/** An agent's name as people know it. */
	private providerName(id: string): string {
		return this.providers.get(id)?.info().name ?? id;
	}

	/**
	 * Hand a thread to another agent. In this thread, it keeps its history, folder and worktree:
	 * the old agent is put away, and the new one is told the conversation with the next message.
	 * With `newThread`, a copy carries on with the new agent and this one is left as it was.
	 * Refused while the agent works: a handoff happens between turns.
	 */
	handoff(
		who: Who,
		id: string,
		input: {
			provider: string;
			model?: string;
			mode?: string;
			effort?: string;
			newThread?: boolean;
		},
	): ChatSessionRow {
		const session = this.owned(who.workspace, id);
		const provider = this.providers.get(input.provider);
		if (!provider?.info().available)
			throw new ChatError("That agent is not installed on this machine", 400);
		assertMayStart(who, input.provider, provider.info().name);
		if (this.live.get(id)?.running)
			throw new ChatError("Wait for this turn to finish, or stop it, before handing off", 409);
		if (input.newThread) return this.fork(who, id, input);
		if (input.provider === session.provider)
			throw new ChatError(`This thread is already with ${provider.info().name}`, 400);
		this.park(id);
		const live = this.liveFor(id);
		// The old agent's commands are not the new one's.
		this.setCommands(live, []);
		const model = input.model ?? null;
		this.store.update(id, {
			provider: input.provider,
			model,
			mode: input.mode ?? provider.info().defaultMode ?? null,
			effort: input.effort ?? null,
			resumeToken: null,
		});
		this.record(id, {
			type: "handoff",
			from: { provider: session.provider, model: session.model },
			to: { provider: input.provider, model },
			at: new Date().toISOString(),
		});
		return this.store.get(id) ?? session;
	}

	/**
	 * A side chat: a copy of this thread to ask a narrow question in, beside it and in the same
	 * folder, left out of the project's list. Optionally with another agent.
	 */
	side(who: Who, id: string, input: { provider?: string; model?: string } = {}): ChatSessionRow {
		const source = this.owned(who.workspace, id);
		if (source.parentId) throw new ChatError("A side chat cannot have side chats of its own", 400);
		const opened = this.sides(who.workspace, id).length + 1;
		return this.fork(who, id, { ...input, side: `Side chat ${opened} · ${source.title}` });
	}

	/** The side chats opened beside a thread. */
	sides(workspace: string, id: string): ChatSessionRow[] {
		this.owned(workspace, id);
		return this.store.sides(id);
	}

	/**
	 * What the agent suggested adding to the shared notes it was given, from the turn just ended,
	 * kept for the team to add or dismiss on the note.
	 */
	private keepNoteSuggestions(id: string): void {
		const session = this.store.get(id);
		if (!session?.notes) return;
		const known = sharedNoteIds(session.notes.text);
		if (known.size === 0) return;
		const events = this.store.events(id);
		const start = events.findLastIndex((event) => event.type === "turn_start");
		const reply = events
			.slice(start + 1)
			.map((event) => (event.type === "message" ? event.text : ""))
			.join("");
		const drafts = noteSuggestions(reply, known);
		if (drafts.length) this.store.addNoteSuggestions(session, drafts);
	}

	/** A project's suggested additions to its notes, waiting on someone. */
	noteSuggestions(workspace: string, project: string): NoteSuggestion[] {
		return this.store.noteSuggestions(workspace, project);
	}

	/** Someone added or dismissed a suggestion. */
	dropNoteSuggestion(workspace: string, id: string): void {
		if (!this.store.dropNoteSuggestion(workspace, id))
			throw new ChatError("That suggestion is no longer there", 404);
	}

	/** Everything a thread has logged, for what an automation run left behind. */
	events(workspace: string, id: string): ChatEvent[] {
		this.owned(workspace, id);
		return this.store.events(id);
	}

	/** The most recent turn outcome, including the same error shown in its transcript. */
	turnOutcome(workspace: string, id: string): Extract<ChatEvent, { type: "turn_end" }> | null {
		this.owned(workspace, id);
		return (
			(this.store.events(id).findLast((event) => event.type === "turn_end") as
				| Extract<ChatEvent, { type: "turn_end" }>
				| undefined) ?? null
		);
	}

	/**
	 * A turn the agent failed, in words that say what to do about it: the model is gone, or the
	 * provider is too busy, and whose side that is on. The agent's own text always stays, under
	 * the plain line; any other failure is left exactly as it was said.
	 */
	private explainFailure(
		session: ChatSessionRow,
		error: string,
	): { error: string; retryable: boolean; kind: TurnErrorKind | null; model: string | null } {
		const kind = turnErrorKind(error);
		const model = this.store.get(session.id)?.model ?? session.model;
		if (!kind) return { error, retryable: false, kind, model };
		const name = this.providers.get(session.provider)?.info().name ?? session.provider;
		return {
			error: turnErrorMessage(kind, name, model, error),
			retryable: turnRetryable(kind),
			kind,
			model,
		};
	}

	/**
	 * After the agent said a model is gone: ask it for its models again (what "refresh models"
	 * does), and only when its fresh list no longer has the model take it out of this chat. An
	 * agent that still lists a model it retired (opencode's notice) has it dropped from the kept
	 * list too; any other refusal of a model it still lists is left alone.
	 */
	private async forgetGoneModel(
		session: ChatSessionRow,
		model: string,
		error: string,
	): Promise<void> {
		const info = await this.providerInfo(session.provider, true);
		const listed = info.models.some((entry) => entry.id === model);
		if (listed) {
			if (!isRetiredNotice(error)) return;
			this.store.dropCatalogModel(session.provider, model);
		}
		// Someone may have picked another model meanwhile: leave their choice alone.
		if (this.store.get(session.id)?.model !== model) return;
		this.store.update(session.id, { model: null });
		// An idle agent still holds that model: close it, so the next message starts one without a
		// model of its own instead of failing the same way again.
		const live = this.live.get(session.id);
		const opened = live?.agent;
		if (live && opened && !live.running) {
			live.agent = null;
			opened
				.then((agent) => agent.close())
				.catch((cause: unknown) => {
					console.warn(
						"[runner] Could not close the agent after its model was refused:",
						cause instanceof Error ? cause.message : cause,
					);
				});
		}
	}

	cancel(workspace: string, id: string): void {
		this.owned(workspace, id);
		// `agentFor` rejects when the agent will not start; an unhandled rejection is fatal to the
		// runner, so this derived promise needs a handler of its own (`park` carries one too).
		void this.live
			.get(id)
			?.agent?.then((agent) => agent.cancel())
			.catch(() => undefined);
	}

	/** Answers a permission request by the workspace's policy; false when it is the person's to answer. */
	private answerByPolicy(
		id: string,
		live: Live,
		event: Extract<ChatEvent, { type: "approval" }>,
	): boolean {
		const session = this.store.get(id);
		if (!session) return false;
		const { policy, defaultBranch } = this.workspacePolicy(session.workspaceId);
		const optionId = answerFor(policy, event, live.toolKinds?.get(event.id), defaultBranch);
		if (!optionId) return false;
		void live.agent?.then((agent) => agent.approve(event.id, optionId)).catch(() => undefined);
		return true;
	}

	approve(workspace: string, id: string, approvalId: string, optionId: string | null): void {
		this.owned(workspace, id);
		const asked = this.asks.get(approvalId);
		if (asked) {
			if (asked.thread !== id) throw new ChatError("That approval is not in this thread", 404);
			asked.answer(optionId);
			return;
		}
		void this.live
			.get(id)
			?.agent?.then((agent) => agent.approve(approvalId, optionId))
			.catch(() => undefined);
	}

	async stopRunning(workspace: string, id: string): Promise<void> {
		this.owned(workspace, id);
		const live = this.live.get(id);
		if (!live?.running || !live.agent) throw new ChatError("That agent is no longer running", 409);
		const agent = await live.agent;
		if (!live.running) throw new ChatError("That agent is no longer running", 409);
		agent.cancel();
	}

	/** Answer a still-pending request and report delivery failures to the caller. */
	async answerPending(
		workspace: string,
		id: string,
		approvalId: string,
		optionId: string | null,
	): Promise<void> {
		this.owned(workspace, id);
		const open = new Map<string, Extract<ChatEvent, { type: "approval" }>>();
		for (const event of this.store.events(id)) {
			if (event.type === "approval") open.set(event.id, event);
			else if (event.type === "approval_resolved") open.delete(event.id);
			else if (event.type === "turn_end") open.clear();
		}
		const approval = open.get(approvalId);
		if (!approval) throw new ChatError("That approval is no longer waiting", 409);
		if (optionId !== null && !approval.options.some((option) => option.id === optionId))
			throw new ChatError("Choose one of the approval's options", 400);
		const question = this.asks.get(approvalId);
		if (question) {
			if (question.thread !== id) throw new ChatError("That approval is not in this thread", 404);
			question.answer(optionId);
			return;
		}
		const live = this.live.get(id);
		const pending = live?.agent;
		if (!live?.running || !pending) throw new ChatError("The agent is no longer running", 409);
		const agent = await pending;
		if (!live.running) throw new ChatError("The agent is no longer running", 409);
		// Another device may have answered while the provider was starting.
		if (
			this.store
				.events(id)
				.some((event) => event.type === "approval_resolved" && event.id === approvalId)
		)
			throw new ChatError("That approval was already answered", 409);
		agent.approve(approvalId, optionId);
		this.record(id, { type: "approval_resolved", id: approvalId, optionId });
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
				commands: null,
				journal: [],
				journalStart: 0,
				running: false,
				buffered: null,
				flushTimer: undefined,
				idleTimer: undefined,
				...this.keptQueue(id),
			};
			this.live.set(id, live);
		}
		return live;
	}

	/**
	 * The queue a thread had when this runner last held it. After a restart it is held: the turn
	 * it waited on was cut off, and the person says when to go on.
	 */
	private keptQueue(id: string): { queue: QueuedMessage[]; paused: boolean } {
		const kept = this.store.queue(id);
		return { queue: kept.items, paused: kept.items.length > 0 };
	}

	private agentFor(session: ChatSessionRow, live: Live): Promise<AgentSession> {
		clearTimeout(live.idleTimer);
		if (live.agent) return live.agent;
		const provider = this.providers.get(session.provider);
		if (!provider) return Promise.reject(new ChatError("That agent is no longer available", 400));
		const opening = (async () => {
			const fresh = this.store.get(session.id) ?? session;
			const root = await realpath(this.projectsDir);
			const cwd = await realpath(fresh.cwd);
			const inside = relative(root, cwd);
			if (inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside))
				throw new ChatError("That folder is outside the projects directory", 403);
			return provider.start({
				cwd,
				model: fresh.model ?? undefined,
				mode: fresh.mode ?? undefined,
				effort: fresh.effort ?? undefined,
				resume: fresh.resumeToken ?? undefined,
				env: this.personal(fresh.ownerId).env,
				mcpServers: [
					...this.mcp(fresh.workspaceId, fresh.provider, fresh.id),
					...this.gridServer(fresh.id),
				],
				emit: (event) => this.record(session.id, event),
				onResumeToken: (token) => this.store.update(session.id, { resumeToken: token }),
			});
		})();
		live.agent = opening;
		opening.catch(() => {
			// Only forget this start if it is still the one we are waiting on: a chat that was
			// parked and prompted again has a newer agent by now, and clearing it here would drop
			// the live agent on the floor, never to be closed.
			if (live.agent === opening) live.agent = null;
		});
		return opening;
	}

	/**
	 * The thread working on each branch of a project, by the branch of its own worktree: who made a
	 * pull request from that branch (the agent, the role it was started as, the thread's title).
	 */
	branchThreads(
		workspace: string,
		project: string,
	): Map<string, { id: string; title: string; provider: string; role: string | null }> {
		const found = new Map<
			string,
			{ id: string; title: string; provider: string; role: string | null }
		>();
		for (const session of this.store.list(workspace, project)) {
			const branch = session.worktree?.branch;
			if (!branch || found.has(branch)) continue;
			found.set(branch, {
				id: session.id,
				title: session.title,
				provider: session.provider,
				role: session.role?.name ?? null,
			});
		}
		return found;
	}

	/** The last agent edit of each of these files (absolute paths), and its thread's title, for Files. */
	agentEdits(
		workspace: string,
		paths: readonly string[],
	): Map<string, AgentEdit & { title: string | null }> {
		const edits = new Map<string, AgentEdit & { title: string | null }>();
		for (const [path, edit] of this.store.agentEdits(workspace, paths)) {
			const session = this.store.get(edit.sessionId);
			if (session?.workspaceId === workspace) edits.set(path, { ...edit, title: session.title });
		}
		return edits;
	}

	/** Log an event and send it to every device watching. Streamed text is merged before it is written. */
	private record(id: string, event: ChatEvent): void {
		const live = this.liveFor(id);
		// What the person or Grid sent in does not count: only the agent's own doing shows it alive.
		if (event.type !== "steer" && event.type !== "user") live.activeAt = Date.now();
		// What the agent can be asked to do is not part of the conversation: it is kept for the
		// session and sent again to whoever attaches, rather than written into the log.
		if (event.type === "commands") {
			this.setCommands(live, event.commands);
			return;
		}
		if (event.type === "info") {
			const change: { model?: string; mode?: string; effort?: string } = {};
			if (event.model) change.model = event.model;
			if (event.mode) change.mode = event.mode;
			if (event.effort) change.effort = event.effort;
			if (change.model || change.mode || change.effort) this.store.update(id, change);
		}
		if (event.type === "tool" && event.diffs?.length && event.status !== "failed") {
			// Remembered per file, so Files can say which agent made a change not yet committed.
			const session = this.store.get(id);
			if (session)
				this.store.recordAgentEdits(
					id,
					session.provider,
					event.diffs.map((diff) => realPath(resolve(session.cwd, diff.path))),
				);
		}
		if (event.type === "tool" && event.kind) {
			live.toolKinds ??= new Map();
			live.toolKinds.set(event.id, event.kind);
		}
		const n = this.journalPush(live, event);
		for (const client of live.clients) client.event(event, n);
		// A request the workspace has already decided is answered here, and nobody is disturbed.
		// Grid's own questions follow the connector's rules, which already chose to ask.
		const answered =
			event.type === "approval" && !this.asks.has(event.id)
				? this.answerByPolicy(id, live, event)
				: false;
		// An approval waits until someone answers it, so it is reported even with the thread open:
		// leaving without answering must not lose it. A finished turn only matters to someone away.
		const watched = [...live.clients].some((client) => client.watching?.() ?? true);
		if (
			(event.type === "approval" && !answered) ||
			event.type === "approval_resolved" ||
			event.type === "question" ||
			event.type === "question_answered" ||
			(event.type === "turn_end" && !watched)
		) {
			const session = this.store.get(id);
			if (session) this.attention?.(session, event, watched);
		}
		if (event.type === "turn_end" && event.reason === "error" && this.failedTurn) {
			const session = this.store.get(id);
			if (session) this.failedTurn(session);
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

	/**
	 * The agent's current commands, told to every device watching. It is not numbered: it is not
	 * in the journal, so a device catching up gets it from the attach, not from the gap.
	 */
	private setCommands(live: Live, commands: AgentCommand[]): void {
		live.commands = commands;
		for (const client of live.clients) client.event({ type: "commands", commands });
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
		this.busyListener?.(this.busyCount());
	}

	/**
	 * A turn left open in the log with no agent behind it (the runner restarted mid-turn): close
	 * it, and void its pending approvals, so the transcript does not show work that never ends.
	 */
	private closeStaleTurn(id: string, live: Live): void {
		const events = this.store.events(id);
		const openApprovals = new Set<string>();
		const openQuestions = new Set<string>();
		let open = false;
		for (const event of events) {
			if (event.type === "turn_start") open = true;
			else if (event.type === "turn_end") open = false;
			else if (event.type === "approval") openApprovals.add(event.id);
			else if (event.type === "approval_resolved") openApprovals.delete(event.id);
			else if (event.type === "question") openQuestions.add(event.id);
			else if (event.type === "question_answered") openQuestions.delete(event.id);
		}
		const fixes: ChatEvent[] = [
			...[...openApprovals].map((approvalId): ChatEvent => ({
				type: "approval_resolved",
				id: approvalId,
				optionId: null,
			})),
			...[...openQuestions].map((questionId): ChatEvent => ({
				type: "question_answered",
				id: questionId,
				answers: null,
			})),
		];
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

/**
 * A file's path with symlinks in its folder followed, as Files compares them: the agent names
 * the path it was given, which may run through a linked projects folder. The file itself may be
 * gone (an agent deleted it), so only its folder is resolved; failing that, the path as given.
 */
function realPath(path: string): string {
	try {
		return join(realpathSync(dirname(path)), basename(path));
	} catch {
		return path;
	}
}
