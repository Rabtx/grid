export type ServiceState = "healthy" | "degraded" | "down" | "unknown";

export interface OperateService {
	id: string;
	name: string;
	url: string;
	state: ServiceState;
	checkedAt: string | null;
	responseMs: number | null;
	uptime: number | null;
	p95: number | null;
	checks: number;
	coverage: number;
	incidentId: string | null;
}

export interface Incident {
	id: string;
	serviceId: string;
	serviceName: string;
	url: string;
	status: "open" | "resolved";
	openedAt: string;
	resolvedAt: string | null;
	monitoring: boolean;
}

export interface OperateOverview {
	project: string;
	intervalSeconds: number;
	allowed: boolean;
	checkedAt: string | null;
	services: OperateService[];
	incidents: Incident[];
}

export interface LogSource {
	name: string;
	path: string;
}
export interface LogSources {
	project: string;
	allowed: boolean;
	sources: LogSource[];
}
export interface LogTail {
	name: string;
	path: string;
	text: string;
	readAt: string;
	truncated: boolean;
	bytes: number;
	lines: number;
}
export interface HostingChargeInput {
	service: string;
	provider: string;
	amountCents: number;
	date: string;
}
export interface HostingCharge extends HostingChargeInput {
	id: string;
	createdAt: string;
}
export interface CostCoverage {
	costUsd: number | null;
	reportedSessions: number;
	totalSessions: number;
}
export interface OperateCostsOverview {
	project: string;
	allowed: boolean;
	currency: "USD";
	agents: CostCoverage & { providers: (CostCoverage & { provider: string })[] };
	hosting: { totalCents: number | null; charges: HostingCharge[] };
}
