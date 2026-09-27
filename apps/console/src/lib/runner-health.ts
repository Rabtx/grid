import { createSignal } from "solid-js";

import appPackage from "../../package.json";
import { workspaceHeaders } from "./active-workspace";

export type HealthResponse = { ok: boolean; startedAt: number };

export type ClientDiagnosticEvent = {
	event: "close" | "fallback" | "reconnect";
	source: "chat" | "terminal" | "link";
	sessionId?: string;
	code?: number;
	reason?: string;
	durationMs?: number;
	attempt?: number;
};

type PendingDiagnostic = {
	endpoint: string;
	token: () => string | null;
	workspace: Record<string, string>;
	event: ClientDiagnosticEvent & {
		online: boolean;
		visibility: "visible" | "hidden";
		clientAt: number;
		version: string;
	};
};

const BACKOFF_DELAYS = [1000, 2000, 4000, 5000];
const DIAGNOSTIC_BATCH_SIZE = 25;
const MAX_QUEUED_DIAGNOSTICS = 500;
const CLIENT_CLOSE_REASONS = new Set([
	"No hello",
	"Expected hello",
	"Sign in again",
	"That environment does not exist",
	"That terminal does not exist",
	"That chat does not exist",
	"Chat failed",
	"Nothing open",
	"The connection dropped",
	"The connection stopped answering",
	"The runner is not reachable",
	"The runner refused sign-in",
	"Client detached",
	"Replaced",
	"Too many open terminals and chats on one connection",
	"Unknown channel kind",
]);

const diagnosticQueue: PendingDiagnostic[] = [];
let diagnosticTimer: ReturnType<typeof setTimeout> | undefined;
let flushingDiagnostics = false;

/** Queue a privacy-limited event; the request is best-effort and never retries in a loop. */
export function reportClientDiagnostic(
	base: string,
	token: () => string | null,
	event: ClientDiagnosticEvent,
): void {
	if (typeof window === "undefined") return;
	try {
		const online = isOnline();
		const parsed = new URL(base, window.location.origin);
		if (parsed.protocol === "ws:") parsed.protocol = "http:";
		if (parsed.protocol === "wss:") parsed.protocol = "https:";
		const path = parsed.pathname.replace(/\/(chat|terminal|link)\/?$/, "").replace(/\/$/, "");
		parsed.pathname = `${path}/diagnostics/client`;
		parsed.search = "";
		parsed.hash = "";
		const reason = event.reason ?? "";
		diagnosticQueue.push({
			endpoint: parsed.toString(),
			token,
			workspace: workspaceHeaders(),
			event: {
				...event,
				...(event.reason === undefined ? {} : { reason: safeClientReason(reason) }),
				online,
				visibility: document.visibilityState === "hidden" ? "hidden" : "visible",
				clientAt: Date.now(),
				version: appPackage.version,
			},
		});
		if (diagnosticQueue.length > MAX_QUEUED_DIAGNOSTICS) diagnosticQueue.shift();
		if (online) scheduleDiagnosticFlush();
	} catch {
		// Diagnostic reporting must never affect the socket state or reconnect path.
	}
}

function isOnline(): boolean {
	return typeof navigator === "undefined" || navigator.onLine !== false;
}

function safeClientReason(reason: string): string {
	return CLIENT_CLOSE_REASONS.has(reason)
		? reason
		: reason
			? "Unrecognized close reason omitted"
			: "";
}

function scheduleDiagnosticFlush(): void {
	if (diagnosticTimer || flushingDiagnostics) return;
	diagnosticTimer = setTimeout(() => {
		diagnosticTimer = undefined;
		void flushDiagnostics();
	}, 300);
}

async function flushDiagnostics(): Promise<void> {
	if (flushingDiagnostics || !diagnosticQueue.length || !isOnline()) return;
	flushingDiagnostics = true;
	const batch = diagnosticQueue.splice(0, DIAGNOSTIC_BATCH_SIZE);
	const groups = new Map<string, PendingDiagnostic[]>();
	for (const pending of batch) {
		const key = `${pending.endpoint}\n${pending.workspace["X-Grid-Workspace"] ?? ""}`;
		groups.set(key, [...(groups.get(key) ?? []), pending]);
	}
	const grouped = [...groups.values()];
	try {
		for (const [index, group] of grouped.entries()) {
			let token: string | null;
			try {
				token = group[0]?.token() ?? null;
			} catch {
				continue;
			}
			if (!token) continue;
			try {
				await fetch(group[0].endpoint, {
					method: "POST",
					headers: {
						...group[0].workspace,
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ events: group.map((pending) => pending.event) }),
				});
			} catch {
				if (!isOnline()) {
					diagnosticQueue.unshift(...grouped.slice(index).flat());
					break;
				}
				// Best effort: a reachable but failing endpoint must not produce a retry loop.
			}
		}
	} finally {
		flushingDiagnostics = false;
		if (diagnosticQueue.length && isOnline()) scheduleDiagnosticFlush();
	}
}

if (typeof window !== "undefined") {
	window.addEventListener("online", () => void flushDiagnostics());
}

let _runnerUp = true;
let _runnerRestarted = false;
let _runnerStartedAt: number | null = null;

const [getRunnerUp, setSignalUp] = createSignal(true);
const [getRunnerRestarted, setSignalRestarted] = createSignal(false);
const [getRunnerStartedAt, setSignalStartedAt] = createSignal<number | null>(null);

function runnerUp(): boolean {
	getRunnerUp();
	return _runnerUp;
}

function runnerRestarted(): boolean {
	getRunnerRestarted();
	return _runnerRestarted;
}

function runnerStartedAt(): number | null {
	getRunnerStartedAt();
	return _runnerStartedAt;
}

function setRunnerUp(value: boolean): void {
	_runnerUp = value;
	setSignalUp(value);
}

function setRunnerRestarted(value: boolean): void {
	_runnerRestarted = value;
	setSignalRestarted(value);
}

function setRunnerStartedAt(value: number | null): void {
	_runnerStartedAt = value;
	setSignalStartedAt(value);
}

let lastKnownStartedAt: number | null = null;
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let backoffAttempt = 0;
let isPolling = false;

const recoveryCallbacks = new Set<() => void>();

export function onRunnerRecovered(cb: () => void): () => void {
	recoveryCallbacks.add(cb);
	return () => recoveryCallbacks.delete(cb);
}

export function resetRunnerRestarted(): void {
	setRunnerRestarted(false);
}

export async function checkRunnerHealth(customFetch?: typeof fetch): Promise<boolean> {
	const fetcher = customFetch ?? fetch;
	const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3001";
	try {
		const res = await fetcher(`${origin}/runner/health`, {
			cache: "no-store",
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const data = (await res.json()) as HealthResponse;
		const wasDown = !runnerUp();

		if (lastKnownStartedAt !== null && data.startedAt !== lastKnownStartedAt) {
			setRunnerRestarted(true);
		}
		lastKnownStartedAt = data.startedAt;
		setRunnerStartedAt(data.startedAt);
		setRunnerUp(true);
		backoffAttempt = 0;
		stopPolling();

		if (wasDown) {
			for (const cb of recoveryCallbacks) {
				try {
					cb();
				} catch {
					// Ignore callback failures
				}
			}
		}
		return true;
	} catch {
		setRunnerUp(false);
		scheduleNextPoll(customFetch);
		return false;
	}
}

function scheduleNextPoll(customFetch?: typeof fetch): void {
	if (typeof window === "undefined") return;
	clearTimeout(pollTimer);
	isPolling = true;
	const delay = BACKOFF_DELAYS[Math.min(backoffAttempt, BACKOFF_DELAYS.length - 1)];
	backoffAttempt += 1;
	pollTimer = setTimeout(() => {
		void checkRunnerHealth(customFetch);
	}, delay);
}

function stopPolling(): void {
	clearTimeout(pollTimer);
	pollTimer = undefined;
	isPolling = false;
	backoffAttempt = 0;
}

export function reportRunnerFailure(customFetch?: typeof fetch): void {
	setRunnerUp(false);
	if (!isPolling) {
		scheduleNextPoll(customFetch);
	}
}

export function reportRunnerSuccess(): void {
	setRunnerUp(true);
	stopPolling();
}

/** Initialize global listeners on browser window. */
if (typeof window !== "undefined") {
	window.addEventListener("online", () => {
		void checkRunnerHealth();
	});
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "visible") {
			void checkRunnerHealth();
		}
	});
}

export { runnerUp, runnerRestarted, runnerStartedAt };
