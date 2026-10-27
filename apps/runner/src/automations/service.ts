import type { Who } from "../auth";
import type { ChatHub } from "../chat/hub";
import type { InboxStore } from "../inbox/store";
import { automationPrompt, costSoFar, runOutcome, touchedOffLimits } from "./outcome";
import type { AuditLog } from "../audit/audit-log";
import type { RateLog } from "../rate-log";
import { nextScheduled, type EventTrigger } from "./schedule";
import {
	DeliveryLimit,
	deliveryBrief,
	deliveryId,
	deliveryProved,
	deliveryWanted,
	MAX_BODY_BYTES,
	type WebhookSecrets,
	webhookOf,
} from "./webhooks";
import type { AutomationStore, Automation, AutomationRun, RunOutcome } from "./store";

/** What a run needs from the rest of the runner beyond chats and the inbox. */
export type AutomationDeps = {
	/** Where runs starting and webhooks refused are noted (Settings → Audit log). */
	audit?: AuditLog;
	/** A role of the workspace, to run as. */
	roleOf?: (
		workspace: string,
		id: string,
	) => { id: string; name: string; icon: string; brief: string } | null;
	/** Rate limits kept across restarts (webhook deliveries); in memory without it. */
	rates?: RateLog;
	/** Each automation's webhook secret (see `webhooks.ts`); webhooks are refused without it. */
	hooks?: WebhookSecrets;
	/** The open pull request from a branch, to say a run opened one. */
	pullOf?: (
		ownerId: string,
		project: string,
		workspace: string,
		branch: string,
	) => Promise<number | null>;
};

/** How often a run with a budget is looked at for what it has cost so far. */
const BUDGET_CHECK_MS = 10_000;

const GRACE_MS = 30 * 60_000;
const WAKE_MAX_MS = 3 * 60_000;
const CONCURRENT_LIMIT = 2;

/** Saved jobs on one runner. The database is authoritative across a restart. */
export class Automations {
	private timer: ReturnType<typeof setTimeout> | null = null;
	private stopped = false;
	private syncEvents: ((workspace: string, ownerId: string) => Promise<void>) | null = null;
	constructor(
		readonly store: AutomationStore,
		private readonly chat: ChatHub,
		private readonly inbox: InboxStore,
		private readonly deps: AutomationDeps = {},
	) {
		this.deliveries = new DeliveryLimit(deps.rates);
		this.wake();
	}

	/** Runs whose thread Grid carried on after a restart, by thread: each ends with its turn. */
	private readonly following = new Map<string, { item: Automation; run: AutomationRun }>();

	/**
	 * After a restart, once the chat hub has recovered: the runs going on when the runner stopped.
	 * One whose thread the hub carried on (`carried`) keeps running and ends as that thread's next
	 * turn does (its time and budget limits are not watched again); the rest have failed.
	 */
	recover(carried: readonly string[] = []): void {
		const going = new Set(carried);
		for (const run of this.store.running()) {
			const item = this.store.listForRun(run.automationId);
			if (item && run.sessionId && going.has(run.sessionId)) {
				this.following.set(run.sessionId, { item, run });
				continue;
			}
			const message = "Runner stopped before this run finished";
			if (item) this.failed(item, run.id, message, run.sessionId);
			else this.store.finish(run.id, "failed", message, run.sessionId);
		}
		if (this.following.size)
			this.chat.onTurnEnded((session, reason) => {
				const followed = this.following.get(session.id);
				if (!followed) return;
				this.following.delete(session.id);
				const { item, run } = followed;
				const events = this.chat.events(item.workspace, session.id);
				const outcome = runOutcome(events);
				if (reason === "done")
					this.store.finish(run.id, "succeeded", null, session.id, {
						...outcome,
						pullNumber: null,
					});
				else
					this.failed(
						item,
						run.id,
						`Agent turn ${reason} after the runner restarted`,
						session.id,
						outcome,
					);
			});
	}
	/** Webhook secrets, when this runner takes webhooks. */
	get hooks(): WebhookSecrets | undefined {
		return this.deps.hooks;
	}

	stop(): void {
		this.stopped = true;
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
	}
	changed(): void {
		this.arm();
	}
	setEventSync(sync: (workspace: string, ownerId: string) => Promise<void>): void {
		this.syncEvents = sync;
		this.arm();
	}

	private arm(): void {
		if (this.timer) clearTimeout(this.timer);
		if (this.stopped) return;
		const earliest = this.store.earliest();
		const eventOwners = this.store.eventOwners();
		if (!earliest && !eventOwners.length) {
			this.timer = null;
			return;
		}
		this.timer = setTimeout(
			() => this.wake(),
			Math.max(
				0,
				Math.min(WAKE_MAX_MS, earliest ? Date.parse(earliest) - Date.now() : WAKE_MAX_MS),
			),
		);
		this.timer.unref();
	}
	private wake(): void {
		if (this.stopped) return;
		const now = new Date();
		for (const item of this.store.due(now.toISOString())) {
			const scheduled = item.nextRunAt as string;
			this.store.setNext(item.id, nextScheduled(item.triggers, now));
			if (now.getTime() - Date.parse(scheduled) > GRACE_MS) {
				const run = this.store.start(item.id, "schedule", scheduled, null);
				if (run)
					this.store.finish(
						run.id,
						"skipped",
						"Missed the 30-minute grace period while the runner was off",
						null,
					);
			} else void this.launch(item, "schedule", scheduled, null);
		}
		if (this.syncEvents)
			for (const owner of this.store.eventOwners())
				void this.syncEvents(owner.workspace, owner.ownerId).catch((cause: unknown) => {
					console.warn("[automations] GitHub refresh failed:", cause);
				});
		this.arm();
	}

	/** Webhook deliveries each automation took lately (see `webhooks.ts`). */
	private readonly deliveries: DeliveryLimit;

	/**
	 * A webhook delivery (`POST /hooks/automations/<id>`, with no sign-in): proved with the
	 * automation's secret, run once, and given to the agent as data (see `webhooks.ts`).
	 */
	async hook(id: string, request: Request, url: URL): Promise<Response> {
		const answer = (status: number, message: string, data?: unknown) =>
			Response.json(data === undefined ? { message } : { message, data }, { status });
		if (request.method !== "POST") return answer(405, "Webhooks are POSTed");
		const item = /^[\w-]{1,120}$/.test(id) ? this.store.listForRun(id) : null;
		const trigger = item ? webhookOf(item) : null;
		const hooks = this.deps.hooks;
		// One that does not exist answers like one with a wrong secret: nothing to learn either way.
		if (!item || !trigger || !hooks?.has(item.id)) return answer(401, "Not a webhook Grid knows");
		const length = Number(request.headers.get("content-length") ?? 0);
		if (length > MAX_BODY_BYTES) return answer(413, "Webhook bodies are 256 KB at most");
		const body = await request.text();
		if (body.length > MAX_BODY_BYTES) return answer(413, "Webhook bodies are 256 KB at most");
		if (
			!deliveryProved(hooks.secret(item.id), body, request.headers, url.searchParams.get("token"))
		) {
			this.refused(item, "a delivery that did not prove itself with the secret");
			return answer(401, "Not a webhook Grid knows");
		}
		if (!item.enabled) return answer(409, "This automation is turned off");
		if (!this.deliveries.take(item.id)) {
			this.refused(item, "deliveries past 30 a minute");
			return answer(429, "Too many deliveries; slow down");
		}
		let payload: unknown;
		try {
			payload = body.trim() ? JSON.parse(body) : undefined;
		} catch {
			payload = undefined;
		}
		if (!deliveryWanted(trigger, payload)) return answer(202, "Filtered out; nothing ran");
		try {
			const run = this.launch(
				item,
				"webhook",
				null,
				`webhook:${deliveryId(body, request.headers)}`,
				deliveryBrief(trigger, payload, body),
			);
			return answer(202, run.status === "skipped" ? (run.error ?? "Skipped") : "Running", {
				run: run.id,
				status: run.status,
			});
		} catch (cause) {
			if (cause instanceof AutomationError && cause.status === 409)
				return answer(200, "This delivery already ran");
			throw cause;
		}
	}

	/** When each automation's last refused delivery was noted: at most one a minute is. */
	private readonly refusedAt = new Map<string, number>();

	private refused(item: Automation, why: string, now = Date.now()): void {
		if (now - (this.refusedAt.get(item.id) ?? 0) < 60_000) return;
		this.refusedAt.set(item.id, now);
		this.deps.audit?.record({
			workspaceId: item.workspace,
			actor: { kind: "webhook", id: item.id, name: item.name },
			action: "webhook.refused",
			project: item.project,
			sessionId: null,
			target: item.name,
			detail: `Refused ${why} (more like it in the next minute are not noted)`,
		});
	}

	runNow(who: Who, id: string): AutomationRun {
		const item = this.store.get(who.workspace, id);
		if (!item) throw new AutomationError("Automation not found", 404);
		if (item.ownerId !== who.userId)
			throw new AutomationError("Only the owner can run this automation", 403);
		return this.launch(item, "manual", null, null);
	}

	/**
	 * Called only by the existing Inbox GitHub refresh, never by a second poller. Every refresh
	 * offers everything still open, so an item a busy job could not take now is taken on a later
	 * one rather than lost; each item still runs a job at most once.
	 */
	event(
		workspace: string,
		ownerId: string,
		project: string,
		type: EventTrigger["event"],
		itemId: string,
		openedAt?: string,
	): void {
		for (const item of this.store.list(workspace)) {
			if (
				!item.enabled ||
				item.ownerId !== ownerId ||
				item.project !== project ||
				!item.triggers.some((trigger) => trigger.kind === "event" && trigger.event === type)
			)
				continue;
			// Pull requests already open when the job was saved or switched on are not new to it.
			if (type === "pull_opened" && openedAt && Date.parse(openedAt) < Date.parse(item.updatedAt))
				continue;
			if (this.store.active(item.id) || this.store.countActive() >= CONCURRENT_LIMIT) continue;
			try {
				this.launch(item, "event", null, `${type}:${project}:${itemId}`);
			} catch (cause) {
				if (cause instanceof AutomationError && cause.status === 409) continue;
				console.warn("[automations] GitHub event could not start:", cause);
			}
		}
	}

	/** A linked event job needs a visible reason when GitHub or its project cannot be read. */
	eventError(workspace: string, ownerId: string, project: string, message: string): void {
		for (const item of this.store.list(workspace)) {
			if (
				!item.enabled ||
				item.ownerId !== ownerId ||
				item.project !== project ||
				!item.triggers.some((trigger) => trigger.kind === "event")
			)
				continue;
			this.inbox.keep({
				id: `automation-sync:${item.id}`,
				workspaceId: workspace,
				ownerId,
				kind: "turn_error",
				project,
				title: item.name,
				body: `GitHub refresh failed: ${message}`,
				url: "/automations",
				createdAt: new Date().toISOString(),
			});
		}
	}

	private launch(
		item: Automation,
		trigger: AutomationRun["trigger"],
		scheduledFor: string | null,
		eventKey: string | null,
		/** What the run is told beyond its prompt (a webhook's delivery). */
		extra: string | null = null,
	): AutomationRun {
		// Record each refusal as a run, so history explains why it did not execute.
		const overlapping = this.store.active(item.id);
		const crowded = this.store.countActive() >= CONCURRENT_LIMIT;
		const run = this.store.start(item.id, trigger, scheduledFor, eventKey);
		if (!run) throw new AutomationError("This GitHub item already ran", 409);
		if (overlapping || crowded) {
			this.store.finish(
				run.id,
				"skipped",
				overlapping ? "This automation is already running" : "Two automations are already running",
				null,
			);
			return {
				...run,
				status: "skipped",
				error: overlapping
					? "This automation is already running"
					: "Two automations are already running",
			};
		}
		void this.execute(item, run, extra).catch((cause: unknown) => {
			console.error("[automations] could not record a run outcome:", cause);
		});
		return run;
	}

	private async execute(item: Automation, run: AutomationRun, extra: string | null): Promise<void> {
		let sessionId: string | null = null;
		let limit: ReturnType<typeof setTimeout> | null = null;
		let budget: ReturnType<typeof setInterval> | null = null;
		const { options } = item;
		try {
			const role = options.role ? (this.deps.roleOf?.(item.workspace, options.role) ?? null) : null;
			if (options.role && !role) throw new Error("Its role is gone: choose another");
			const worktree = item.workspaceMode === "worktree";
			const session = await this.chat.createAutomation(
				{ userId: item.ownerId, workspace: item.workspace },
				{
					project: item.project,
					provider: item.provider,
					model: item.model ?? undefined,
					effort: item.effort ?? undefined,
					mode: item.mode ?? undefined,
					worktree,
					base: worktree ? (options.branch ?? undefined) : undefined,
					role,
				},
			);
			const id = session.id;
			sessionId = id;
			this.store.setSession(run.id, id);
			this.deps.audit?.record({
				workspaceId: item.workspace,
				actor: {
					kind: run.trigger === "webhook" ? "webhook" : "automation",
					id: item.id,
					name: item.name,
				},
				action: "automation.run",
				project: item.project,
				sessionId: id,
				target: item.name,
				detail: `Started ${run.trigger === "manual" ? "by hand" : `by its ${run.trigger}`}`,
			});
			this.chat.rename(item.workspace, id, item.name);
			// Its limits: stopped at its time, or once it has cost more than it may.
			let stopped: string | null = null;
			const stop = (why: string) => {
				if (stopped) return;
				stopped = why;
				this.chat.cancel(item.workspace, id);
			};
			if (options.minutes)
				limit = setTimeout(
					() => stop(`Stopped at its ${options.minutes} min limit`),
					options.minutes * 60_000,
				);
			if (options.budgetUsd) {
				const most = options.budgetUsd;
				budget = setInterval(() => {
					if (costSoFar(this.chat.events(item.workspace, id)) > most)
						stop(`Stopped over its $${most} budget`);
				}, BUDGET_CHECK_MS);
			}
			const prompt = automationPrompt(item.prompt, options);
			await this.chat.prompt(item.workspace, id, extra ? `${prompt}\n\n---\n\n${extra}` : prompt);
			const result = this.chat.turnOutcome(item.workspace, id);
			if (!result) throw new Error("Agent turn ended without an outcome");
			const events = this.chat.events(item.workspace, id);
			const outcome = runOutcome(events);
			const touched = touchedOffLimits(events, options.offLimits, session.cwd);
			if (stopped) this.failed(item, run.id, stopped, id, outcome);
			else if (touched.length)
				this.failed(item, run.id, `Changed ${touched[0]}, which is off-limits`, id, outcome);
			else if (result.reason !== "done")
				this.failed(item, run.id, result.error ?? `Agent turn ${result.reason}`, id, outcome);
			else {
				const branch = session.worktree?.branch;
				const pullNumber =
					options.pullRequest && branch
						? await (
								this.deps.pullOf?.(item.ownerId, item.project, item.workspace, branch) ??
								Promise.resolve(null)
							).catch(() => null)
						: null;
				this.store.finish(run.id, "succeeded", null, id, { ...outcome, pullNumber });
			}
		} catch (cause) {
			this.failed(item, run.id, cause instanceof Error ? cause.message : String(cause), sessionId);
		} finally {
			if (limit) clearTimeout(limit);
			if (budget) clearInterval(budget);
		}
	}
	private failed(
		item: Automation,
		runId: string,
		message: string,
		sessionId: string | null,
		outcome?: Omit<RunOutcome, "pullNumber">,
	): void {
		this.store.finish(runId, "failed", message, sessionId, outcome);
		this.inbox.keep({
			id: `automation:${runId}`,
			workspaceId: item.workspace,
			ownerId: item.ownerId,
			kind: "turn_error",
			project: item.project,
			title: item.name,
			body: message,
			url: sessionId ? `/chat/${item.project}/${sessionId}` : "/automations",
			createdAt: new Date().toISOString(),
		});
	}
}

export class AutomationError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
	}
}
