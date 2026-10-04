import type { FileDiff } from "@/modules/chat/types/chat.types";

/** Ship as the runner reads it from GitHub: keep in step with apps/runner/src/ship/service.ts. */

export type EnvironmentKind = "production" | "staging" | "preview" | "other";
export type EnvState = "healthy" | "failing" | "deploying" | "down" | "idle";
export type DeployState = "live" | "success" | "failed" | "running" | "inactive";
export type CheckState = "success" | "failure" | "pending" | "skipped" | "neutral";

export interface EnvironmentSummary {
	name: string;
	kind: EnvironmentKind;
	version: string | null;
	sha: string | null;
	state: EnvState;
	url: string | null;
	deployedAt: string | null;
	ahead: number | null;
}

export interface PipelineSummary {
	id: string;
	label: string;
	title: string;
	state: "passing" | "failing" | "running" | "none";
	failing: number;
	at: string | null;
	fix: boolean;
}

export interface ShipOverview {
	repository: string;
	defaultBranch: string;
	environments: EnvironmentSummary[];
	previews: { live: number; open: number };
	pipelines: PipelineSummary[];
}

export interface HistoryEntry {
	id: number;
	version: string;
	sha: string;
	title: string;
	author: string;
	agent: string | null;
	at: string;
	seconds: number | null;
	state: DeployState;
	logUrl: string | null;
	canRollback: boolean;
}

export interface Promotion {
	from: { name: string; version: string; sha: string; url: string | null };
	ahead: number | null;
	commits: { sha: string; title: string; author: string; agent: string | null }[];
	checks: { total: number; passed: number; failed: number; pending: number };
	migrations: string[];
	version: string;
	method: string;
	ready: boolean;
}

export interface Watch {
	environment: string;
	previous: { id: number; sha: string; version: string };
	sha: string;
	version: string;
	startedAt: string;
	until: string | null;
	misses: number;
	outcome: "watching" | "clean" | "rolled-back" | "failed";
	detail: string | null;
}

export interface EnvironmentSettings {
	url?: string;
	promote?: string;
	rollback?: string;
}

export interface EnvironmentDetail extends EnvironmentSummary {
	repository: string;
	host: string | null;
	deployedBy: string | null;
	health: {
		errorRate: { value: number; at: string } | null;
		p95: number | null;
		uptime: number | null;
		checks: number;
		deploysWeek: number;
	};
	promotion: Promotion | null;
	history: HistoryEntry[];
	watch: Watch | null;
	method: string;
	settings: EnvironmentSettings;
	allowed: boolean;
}

export interface Preview {
	number: number;
	title: string;
	branch: string;
	url: string | null;
	state: "ready" | "building" | "failed" | "none";
	at: string | null;
	author: string;
	agent: string | null;
	thread: { id: string; title: string; provider: string } | null;
	pullUrl: string;
}

export interface ShipCheck {
	name: string;
	state: CheckState;
	seconds: number | null;
	startedAt: string | null;
	url: string | null;
	run: number | null;
	job: number | null;
}

export interface PipelineDetail {
	id: string;
	label: string;
	title: string;
	sha: string;
	branch: string;
	number: number | null;
	url: string;
	author: string;
	agent: string | null;
	at: string | null;
	checks: ShipCheck[];
	summary: { total: number; passed: number; failed: number; pending: number };
	/** The first failing Actions check; why it failed comes from `failureLog`. */
	failing: string | null;
	thread: {
		id: string;
		title: string;
		provider: string;
		busy: boolean;
		reply: string;
		diff: FileDiff[];
		changed: number;
		unpushed: number;
	} | null;
	allowed: { rerun: boolean; push: boolean };
}
