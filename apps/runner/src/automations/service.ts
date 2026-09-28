import type { Who } from "../auth";
import type { ChatHub } from "../chat/hub";
import type { InboxStore } from "../inbox/store";
import { nextScheduled, type EventTrigger } from "./schedule";
import type { AutomationStore, Automation, AutomationRun } from "./store";

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
	) {
		for (const run of store.recover()) {
			const item = store.listForRun(run.automationId);
			if (item) this.failed(item, run.id, "Runner stopped before this run finished", run.sessionId);
		}
		this.wake();
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

	runNow(who: Who, id: string): AutomationRun {
		const item = this.store.get(who.workspace, id);
		if (!item) throw new AutomationError("Automation not found", 404);
		if (item.ownerId !== who.userId)
			throw new AutomationError("Only the owner can run this automation", 403);
		return this.launch(item, "manual", null, null);
	}

	/** Called only by the existing Inbox GitHub refresh, never by a second poller. */
	event(
		workspace: string,
		ownerId: string,
		project: string,
		type: EventTrigger["event"],
		itemId: string,
	): void {
		for (const item of this.store.list(workspace)) {
			if (
				!item.enabled ||
				item.ownerId !== ownerId ||
				item.project !== project ||
				!item.triggers.some((trigger) => trigger.kind === "event" && trigger.event === type)
			)
				continue;
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
		void this.execute(item, run).catch((cause: unknown) => {
			console.error("[automations] could not record a run outcome:", cause);
		});
		return run;
	}

	private async execute(item: Automation, run: AutomationRun): Promise<void> {
		let sessionId: string | null = null;
		try {
			const session = await this.chat.createAutomation(
				{ userId: item.ownerId, workspace: item.workspace },
				{
					project: item.project,
					provider: item.provider,
					model: item.model ?? undefined,
					effort: item.effort ?? undefined,
					mode: item.mode ?? undefined,
					worktree: item.workspaceMode === "worktree",
				},
			);
			sessionId = session.id;
			this.store.setSession(run.id, session.id);
			this.chat.rename(item.workspace, session.id, item.name);
			await this.chat.prompt(item.workspace, session.id, item.prompt);
			const result = this.chat.turnOutcome(item.workspace, session.id);
			if (!result) throw new Error("Agent turn ended without an outcome");
			if (result.reason === "done") this.store.finish(run.id, "succeeded", null, session.id);
			else this.failed(item, run.id, result.error ?? `Agent turn ${result.reason}`, session.id);
		} catch (cause) {
			this.failed(item, run.id, cause instanceof Error ? cause.message : String(cause), sessionId);
		}
	}
	private failed(item: Automation, runId: string, message: string, sessionId: string | null): void {
		this.store.finish(runId, "failed", message, sessionId);
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
