import type { OperateService, ServiceState } from "../types/operate.types";

export const STATE_LABEL: Record<ServiceState, string> = {
	healthy: "Healthy",
	degraded: "Degraded",
	down: "Down",
	unknown: "Unknown",
};

export const STATE_TONE = {
	healthy: "success",
	degraded: "warning",
	down: "danger",
	unknown: "neutral",
} as const;

/** Old readings never claim a service is currently healthy, including while offline. */
export function observedState(service: OperateService, now: number): ServiceState {
	const at = service.checkedAt ? Date.parse(service.checkedAt) : NaN;
	return !Number.isFinite(at) || now - at > 180_000 ? "unknown" : service.state;
}

export function percent(value: number | null): string {
	return value === null ? "—" : `${value.toFixed(2)}%`;
}
