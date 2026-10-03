import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { nextScheduled, type Trigger } from "./schedule";

/**
 * How an automation runs beyond its prompt (Figma 20 · Automations, the recipe and guardrails):
 * the role it runs as, the branch it starts from, what it does after (open a pull request, then
 * wait for your review), and the limits it keeps to.
 */
export type AutomationOptions = {
	/** A role of the workspace (its brief goes with the prompt); null for none. */
	role: string | null;
	/** The branch a worktree run starts from; what is checked out when null. */
	branch: string | null;
	/** Open a pull request with the change when done. */
	pullRequest: boolean;
	/** And stop there: the run waits for your review rather than merging anything. */
	waitForReview: boolean;
	/** Stopped after this many minutes; null for no limit. */
	minutes: number | null;
	/** Stopped once a run costs more than this (US dollars, as the agent reports it). */
	budgetUsd: number | null;
	/** Paths it must not change: told to the agent, and a run that touches one fails. */
	offLimits: string[];
	/** Its glyph in the list (a fixed set the console knows); null for the default. */
	icon: string | null;
};

export const DEFAULT_OPTIONS: AutomationOptions = {
	role: null,
	branch: null,
	pullRequest: false,
	waitForReview: false,
	minutes: null,
	budgetUsd: null,
	offLimits: [],
	icon: null,
};

export type Automation = {
	id: string;
	workspace: string;
	ownerId: string;
	name: string;
	prompt: string;
	provider: string;
	model: string | null;
	effort: string | null;
	mode: string | null;
	project: string;
	workspaceMode: "folder" | "worktree";
	enabled: boolean;
	triggers: Trigger[];
	options: AutomationOptions;
	nextRunAt: string | null;
	createdAt: string;
	updatedAt: string;
};

export type AutomationInput = Pick<
	Automation,
	| "name"
	| "prompt"
	| "provider"
	| "model"
	| "effort"
	| "mode"
	| "project"
	| "workspaceMode"
	| "triggers"
> & { enabled: boolean; options?: AutomationOptions };

/** A step of a run, as the agent's tools did it: what, and how it came out. */
export type RunStep = { title: string; detail: string | null };

export type AutomationRun = {
	id: string;
	automationId: string;
	trigger: "schedule" | "event" | "manual";
	eventKey: string | null;
	scheduledFor: string | null;
	startedAt: string | null;
	finishedAt: string | null;
	status: "running" | "succeeded" | "failed" | "skipped";
	error: string | null;
	sessionId: string | null;
	/** What came of it, in the agent's words ("All 214 tests passed"). */
	summary: string | null;
	/** The pull request it opened, when it opened one. */
	pullNumber: number | null;
	/** What it cost, as the agent reported it. */
	costUsd: number | null;
	/** What its tools did, in order. */
	steps: RunStep[];
};

/** What a finished run leaves besides its status. */
export type RunOutcome = Pick<AutomationRun, "summary" | "pullNumber" | "costUsd" | "steps">;

type AutomationRow = Omit<
	Automation,
	"ownerId" | "workspaceMode" | "nextRunAt" | "createdAt" | "updatedAt" | "triggers" | "enabled"
> & {
	owner_id: string;
	workspace_mode: "folder" | "worktree";
	next_run_at: string | null;
	created_at: string;
	updated_at: string;
	triggers: string;
	enabled: number;
	options: string | null;
};
type RunRow = Omit<
	AutomationRun,
	| "automationId"
	| "eventKey"
	| "scheduledFor"
	| "startedAt"
	| "finishedAt"
	| "sessionId"
	| "pullNumber"
	| "costUsd"
	| "steps"
> & {
	automation_id: string;
	event_key: string | null;
	scheduled_for: string | null;
	started_at: string | null;
	finished_at: string | null;
	session_id: string | null;
	pull_number: number | null;
	cost_usd: number | null;
	steps: string | null;
};

/** Options as stored, with anything a newer runner added filled in. */
function readOptions(raw: string | null): AutomationOptions {
	if (!raw) return { ...DEFAULT_OPTIONS };
	try {
		return { ...DEFAULT_OPTIONS, ...(JSON.parse(raw) as Partial<AutomationOptions>) };
	} catch {
		return { ...DEFAULT_OPTIONS };
	}
}

function automation(row: AutomationRow): Automation {
	return {
		id: row.id,
		workspace: row.workspace,
		ownerId: row.owner_id,
		name: row.name,
		prompt: row.prompt,
		provider: row.provider,
		model: row.model,
		effort: row.effort,
		mode: row.mode,
		project: row.project,
		workspaceMode: row.workspace_mode,
		enabled: Boolean(row.enabled),
		triggers: JSON.parse(row.triggers) as Trigger[],
		options: readOptions(row.options),
		nextRunAt: row.next_run_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}
function run(row: RunRow): AutomationRun {
	return {
		id: row.id,
		automationId: row.automation_id,
		trigger: row.trigger,
		eventKey: row.event_key,
		scheduledFor: row.scheduled_for,
		startedAt: row.started_at,
		finishedAt: row.finished_at,
		status: row.status,
		error: row.error,
		sessionId: row.session_id,
		summary: row.summary ?? null,
		pullNumber: row.pull_number ?? null,
		costUsd: row.cost_usd ?? null,
		steps: row.steps ? (JSON.parse(row.steps) as RunStep[]) : [],
	};
}

function hasColumn(db: Database, table: string, column: string): boolean {
	return db
		.query<{ name: string }, []>(`PRAGMA table_info(${table})`)
		.all()
		.some((row) => row.name === column);
}

export class AutomationStore {
	private readonly db: Database;
	constructor(path: string) {
		if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
		this.db = new Database(path, { create: true });
		this.db.exec("PRAGMA journal_mode = WAL");
		this.db.exec(`CREATE TABLE IF NOT EXISTS automations (
			id TEXT PRIMARY KEY, workspace TEXT NOT NULL, owner_id TEXT NOT NULL, name TEXT NOT NULL,
			prompt TEXT NOT NULL, provider TEXT NOT NULL, model TEXT, effort TEXT, mode TEXT,
			project TEXT NOT NULL, workspace_mode TEXT NOT NULL, enabled INTEGER NOT NULL,
			triggers TEXT NOT NULL, next_run_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
		);
		CREATE INDEX IF NOT EXISTS automations_due ON automations (enabled, next_run_at);
		CREATE TABLE IF NOT EXISTS automation_runs (
			id TEXT PRIMARY KEY, automation_id TEXT NOT NULL, trigger TEXT NOT NULL,
			event_key TEXT, scheduled_for TEXT, started_at TEXT, finished_at TEXT,
			status TEXT NOT NULL, error TEXT, session_id TEXT,
			FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE
		);
		CREATE UNIQUE INDEX IF NOT EXISTS automation_event_once ON automation_runs (automation_id, event_key) WHERE event_key IS NOT NULL;
		CREATE INDEX IF NOT EXISTS automation_run_history ON automation_runs (automation_id, id);`);
		if (!hasColumn(this.db, "automations", "options"))
			this.db.exec("ALTER TABLE automations ADD COLUMN options TEXT");
		for (const [column, type] of [
			["summary", "TEXT"],
			["pull_number", "INTEGER"],
			["cost_usd", "REAL"],
			["steps", "TEXT"],
		])
			if (!hasColumn(this.db, "automation_runs", column))
				this.db.exec(`ALTER TABLE automation_runs ADD COLUMN ${column} ${type}`);
	}

	list(workspace: string): Automation[] {
		return this.db
			.query<AutomationRow, [string]>(
				"SELECT * FROM automations WHERE workspace = ? ORDER BY updated_at DESC LIMIT 200",
			)
			.all(workspace)
			.map(automation);
	}
	get(workspace: string, id: string): Automation | null {
		const row = this.db
			.query<AutomationRow, [string, string]>(
				"SELECT * FROM automations WHERE workspace = ? AND id = ?",
			)
			.get(workspace, id);
		return row ? automation(row) : null;
	}
	listForRun(id: string): Automation | null {
		const row = this.db
			.query<AutomationRow, [string]>("SELECT * FROM automations WHERE id=?")
			.get(id);
		return row ? automation(row) : null;
	}
	create(workspace: string, ownerId: string, input: AutomationInput): Automation {
		const id = crypto.randomUUID(),
			now = new Date().toISOString();
		this.db
			.query(`INSERT INTO automations (id, workspace, owner_id, name, prompt, provider, model, effort,
			mode, project, workspace_mode, enabled, triggers, next_run_at, created_at, updated_at, options)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
			.run(
				id,
				workspace,
				ownerId,
				input.name,
				input.prompt,
				input.provider,
				input.model,
				input.effort,
				input.mode,
				input.project,
				input.workspaceMode,
				Number(input.enabled),
				JSON.stringify(input.triggers),
				input.enabled ? nextScheduled(input.triggers, new Date()) : null,
				now,
				now,
				JSON.stringify(input.options ?? DEFAULT_OPTIONS),
			);
		return this.get(workspace, id) as Automation;
	}
	update(item: Automation, input: AutomationInput): Automation {
		const now = new Date().toISOString();
		this.db
			.query(`UPDATE automations SET name=?, prompt=?, provider=?, model=?, effort=?, mode=?, project=?,
			workspace_mode=?, enabled=?, triggers=?, next_run_at=?, updated_at=?, options=? WHERE id=? AND workspace=? AND owner_id=?`)
			.run(
				input.name,
				input.prompt,
				input.provider,
				input.model,
				input.effort,
				input.mode,
				input.project,
				input.workspaceMode,
				Number(input.enabled),
				JSON.stringify(input.triggers),
				input.enabled ? nextScheduled(input.triggers, new Date()) : null,
				now,
				JSON.stringify(input.options ?? item.options),
				item.id,
				item.workspace,
				item.ownerId,
			);
		return this.get(item.workspace, item.id) as Automation;
	}
	setNext(id: string, next: string | null): void {
		this.db.query("UPDATE automations SET next_run_at = ? WHERE id = ?").run(next, id);
	}
	delete(item: Automation): void {
		this.db.query("DELETE FROM automation_runs WHERE automation_id = ?").run(item.id);
		this.db
			.query("DELETE FROM automations WHERE id = ? AND workspace = ? AND owner_id = ?")
			.run(item.id, item.workspace, item.ownerId);
	}
	due(at: string): Automation[] {
		return this.db
			.query<AutomationRow, [string]>(
				"SELECT * FROM automations WHERE enabled = 1 AND next_run_at <= ? ORDER BY next_run_at LIMIT 100",
			)
			.all(at)
			.map(automation);
	}
	earliest(): string | null {
		return (
			this.db
				.query<{ next_run_at: string }, []>(
					"SELECT next_run_at FROM automations WHERE enabled = 1 AND next_run_at IS NOT NULL ORDER BY next_run_at LIMIT 1",
				)
				.get()?.next_run_at ?? null
		);
	}
	eventOwners(): { workspace: string; ownerId: string }[] {
		return this.db
			.query<{ workspace: string; ownerId: string }, []>(
				`SELECT DISTINCT workspace, owner_id AS ownerId FROM automations
			 WHERE enabled=1 AND triggers LIKE '%"kind":"event"%' LIMIT 200`,
			)
			.all();
	}
	hasPullOpened(workspace: string, ownerId: string, project: string): boolean {
		return this.list(workspace).some(
			(item) =>
				item.enabled &&
				item.ownerId === ownerId &&
				item.project === project &&
				item.triggers.some(
					(trigger) => trigger.kind === "event" && trigger.event === "pull_opened",
				),
		);
	}
	runs(workspace: string, id: string): AutomationRun[] {
		return this.db
			.query<
				RunRow,
				[string, string]
			>(`SELECT r.* FROM automation_runs r JOIN automations a ON a.id=r.automation_id
			WHERE a.workspace=? AND a.id=? ORDER BY COALESCE(r.started_at, r.scheduled_for) DESC, r.rowid DESC LIMIT 50`)
			.all(workspace, id)
			.map(run);
	}
	last(workspace: string, id: string): AutomationRun | null {
		return this.runs(workspace, id)[0] ?? null;
	}
	start(
		id: string,
		trigger: AutomationRun["trigger"],
		scheduledFor: string | null,
		eventKey: string | null,
	): AutomationRun | null {
		const runId = crypto.randomUUID();
		const result = this.db
			.query(`INSERT OR IGNORE INTO automation_runs
			(id, automation_id, trigger, event_key, scheduled_for, started_at, status)
			VALUES (?, ?, ?, ?, ?, ?, 'running')`)
			.run(runId, id, trigger, eventKey, scheduledFor, new Date().toISOString());
		return result.changes ? this.byId(runId) : null;
	}
	finish(
		id: string,
		status: AutomationRun["status"],
		error: string | null,
		sessionId: string | null,
		outcome?: Partial<RunOutcome>,
	): void {
		this.db
			.query(`UPDATE automation_runs SET status=?, error=?, session_id=?, finished_at=?,
			summary=?, pull_number=?, cost_usd=?, steps=? WHERE id=?`)
			.run(
				status,
				error,
				sessionId,
				new Date().toISOString(),
				outcome?.summary ?? null,
				outcome?.pullNumber ?? null,
				outcome?.costUsd ?? null,
				outcome?.steps ? JSON.stringify(outcome.steps) : null,
				id,
			);
	}
	active(id: string): boolean {
		return Boolean(
			this.db
				.query("SELECT 1 FROM automation_runs WHERE automation_id=? AND status='running' LIMIT 1")
				.get(id),
		);
	}
	countActive(): number {
		return (
			this.db
				.query<{ n: number }, []>(
					"SELECT COUNT(*) AS n FROM automation_runs WHERE status='running'",
				)
				.get()?.n ?? 0
		);
	}
	recover(): AutomationRun[] {
		const rows = this.db
			.query<RunRow, []>("SELECT * FROM automation_runs WHERE status='running'")
			.all();
		for (const row of rows)
			this.finish(row.id, "failed", "Runner stopped before this run finished", row.session_id);
		return rows.map(run);
	}
	setSession(id: string, sessionId: string): void {
		this.db.query("UPDATE automation_runs SET session_id=? WHERE id=?").run(sessionId, id);
	}
	private byId(id: string): AutomationRun {
		return run(
			this.db.query<RunRow, [string]>("SELECT * FROM automation_runs WHERE id=?").get(id) as RunRow,
		);
	}
}
