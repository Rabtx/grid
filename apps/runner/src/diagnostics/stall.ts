const INTERVAL_MS = 500;
const STALL_MS = 1_000;
const QUIET_MS = 60_000;

/**
 * Measures how late each tick of a fixed interval fires; a tick more than a second late means
 * something blocked the event loop. Reports at most one stall per quiet period.
 */
export function stallDetector(
	onStall: (lagMs: number) => void,
	now: () => number,
	options: { intervalMs?: number; stallMs?: number; quietMs?: number } = {},
): () => void {
	const intervalMs = options.intervalMs ?? INTERVAL_MS;
	const stallMs = options.stallMs ?? STALL_MS;
	const quietMs = options.quietMs ?? QUIET_MS;
	let expected = now() + intervalMs;
	let reportedAt = Number.NEGATIVE_INFINITY;
	return () => {
		const at = now();
		const lagMs = at - expected;
		expected = at + intervalMs;
		if (lagMs <= stallMs || at - reportedAt < quietMs) return;
		reportedAt = at;
		onStall(Math.round(lagMs));
	};
}

/** Watch the event loop until the returned function is called; the timer never keeps the process up. */
export function watchEventLoop(onStall: (lagMs: number) => void): () => void {
	const tick = stallDetector(onStall, () => performance.now());
	const timer = setInterval(tick, INTERVAL_MS);
	timer.unref();
	return () => clearInterval(timer);
}
