import type { Who } from "../auth";
import type { ChatHub } from "../chat/hub";
import type { ConnectionStore } from "../connectors/store";
import type { Gh } from "../github/gh";
import { parseReading, readingPrompt, type Sources } from "./reading";
import { shipping, type Shipping } from "./shipping";
import type { PulseStore, Snapshot } from "./store";

/** The periods Pulse looks back over. */
export const PERIODS = [7, 30, 90] as const;

// A reading older than this is taken again when someone opens Pulse.
const STALE_MS = 24 * 60 * 60_000;
// GitHub's numbers are asked for again after this.
const SHIPPING_MS = 5 * 60_000;
// An agent reading the numbers is stopped after this.
const READING_MS = 10 * 60_000;
// Agents that take MCP servers from Grid, in the order one is picked when the default cannot.
const READERS = ["claude", "codex", "opencode"];
const NO_CONNECTORS = new Set(["antigravity", "freebuff"]);

export type PulseDeps = {
	chat: ChatHub;
	gh: Gh;
	connections: ConnectionStore;
	store: PulseStore;
};

export class PulseError extends Error {
	constructor(
		message: string,
		readonly status = 400,
	) {
		super(message);
		this.name = "PulseError";
	}
}

/**
 * Pulse (Home → Pulse): the company at a glance. Shipping comes straight from GitHub; revenue,
 * users, activation, errors and what is worth knowing are read by an agent from the services the
 * workspace connected, in a thread anyone can open, once a day or when asked.
 */
export class Pulse {
	private readonly reading = new Set<string>();
	private readonly shipped = new Map<string, { at: number; value: Shipping }>();

	constructor(private readonly deps: PulseDeps) {}

	/** Which of Pulse's services are connected, and working, in a workspace. */
	sources(workspace: string): Sources {
		const live = new Set(
			this.deps.connections
				.list(workspace)
				.filter((item) => item.enabled && item.status !== "signin")
				.map((item) => item.kind),
		);
		return { stripe: live.has("stripe"), posthog: live.has("posthog"), sentry: live.has("sentry") };
	}

	private async shippingFor(workspace: string, days: number): Promise<Shipping> {
		const key = `${workspace}:${days}`;
		const cached = this.shipped.get(key);
		if (cached && Date.now() - cached.at < SHIPPING_MS) return cached.value;
		const value = await shipping(
			this.deps.gh,
			this.deps.chat.projectFolders(workspace),
			(project) => new Set(this.deps.chat.branchThreads(workspace, project).keys()),
			new Date(Date.now() - days * 24 * 60 * 60_000),
		);
		this.shipped.set(key, { at: Date.now(), value });
		return value;
	}

	/** Everything Pulse shows for a period; a stale reading is taken again in the background. */
	async view(who: Who, days: number) {
		if (!PERIODS.includes(days as (typeof PERIODS)[number]))
			throw new PulseError("Look back 7, 30 or 90 days");
		const sources = this.sources(who.workspace);
		const snapshot = this.deps.store.get(who.workspace, days);
		const any = sources.stripe || sources.posthog || sources.sentry;
		if (any && !this.isReading(who.workspace, days)) {
			const stale = !snapshot || Date.now() - Date.parse(snapshot.at) > STALE_MS;
			if (stale) void this.refresh(who, days).catch(() => undefined);
		}
		return {
			days,
			sources,
			shipping: await this.shippingFor(who.workspace, days),
			snapshot,
			reading: this.isReading(who.workspace, days),
		};
	}

	isReading(workspace: string, days: number): boolean {
		return this.reading.has(`${workspace}:${days}`);
	}

	/** The agent that reads: the workspace's default when it can, else the first that can. */
	private async readerFor(who: Who): Promise<string> {
		const available = (await this.deps.chat.providerList(who.userId))
			.filter((item) => item.available && !NO_CONNECTORS.has(item.id))
			.map((item) => item.id);
		const preferred = who.settings?.defaultAgent;
		if (preferred && available.includes(preferred)) return preferred;
		const pick = READERS.find((id) => available.includes(id)) ?? available[0];
		if (!pick)
			throw new PulseError(
				"Install an agent that can use connectors (Claude Code, Codex or opencode)",
				409,
			);
		return pick;
	}

	/** Reads the numbers now, in a thread of their own; resolves with the snapshot it saved. */
	async refresh(who: Who, days: number): Promise<Snapshot> {
		const key = `${who.workspace}:${days}`;
		if (this.reading.has(key)) throw new PulseError("Pulse is already reading the numbers", 409);
		const sources = this.sources(who.workspace);
		if (!sources.stripe && !sources.posthog && !sources.sentry)
			throw new PulseError("Connect Stripe, PostHog or Sentry first", 409);
		const project = Object.keys(this.deps.chat.projectFolders(who.workspace))[0];
		if (!project) throw new PulseError("Add a project first: agents work inside one", 409);
		this.reading.add(key);
		let thread: string | null = null;
		let agent: string | null = null;
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			agent = await this.readerFor(who);
			const session = await this.deps.chat.createAutomation(
				{ userId: who.userId, workspace: who.workspace },
				{ project, provider: agent, worktree: false },
			);
			thread = session.id;
			this.deps.chat.rename(who.workspace, thread, `Pulse · the last ${days} days`);
			const id = thread;
			timer = setTimeout(() => this.deps.chat.cancel(who.workspace, id), READING_MS);
			await this.deps.chat.prompt(who.workspace, id, readingPrompt(sources, days));
			const answer = lastAnswer(this.deps.chat.events(who.workspace, id));
			const reading = parseReading(answer);
			const snapshot: Snapshot = {
				workspace: who.workspace,
				days,
				reading,
				project,
				thread,
				agent,
				error: reading
					? null
					: "The agent's answer had no numbers in it: open the thread to see why",
				at: new Date().toISOString(),
			};
			this.deps.store.save(snapshot);
			return snapshot;
		} catch (cause) {
			const snapshot: Snapshot = {
				workspace: who.workspace,
				days,
				reading: this.deps.store.get(who.workspace, days)?.reading ?? null,
				project,
				thread,
				agent,
				error: cause instanceof Error ? cause.message : String(cause),
				at: new Date().toISOString(),
			};
			this.deps.store.save(snapshot);
			throw cause instanceof PulseError ? cause : new PulseError(snapshot.error ?? "Not read", 502);
		} finally {
			clearTimeout(timer);
			this.reading.delete(key);
		}
	}
}

/** The agent's last answer: its messages after the last thing it was asked. */
export function lastAnswer(events: readonly { type: string; text?: string }[]): string {
	let start = 0;
	events.forEach((event, index) => {
		if (event.type === "user") start = index + 1;
	});
	return events
		.slice(start)
		.filter((event) => event.type === "message" && typeof event.text === "string")
		.map((event) => event.text)
		.join("");
}
