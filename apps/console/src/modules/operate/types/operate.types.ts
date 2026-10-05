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
