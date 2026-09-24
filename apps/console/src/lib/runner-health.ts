import { createSignal } from "solid-js";

export type HealthResponse = { ok: boolean; startedAt: number };

const BACKOFF_DELAYS = [1000, 2000, 4000, 5000];

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
