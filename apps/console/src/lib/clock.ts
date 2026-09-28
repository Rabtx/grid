import { createSignal } from "solid-js";

const TICK_MS = 30_000;

const [tick, setTick] = createSignal(Date.now());
let started = false;

function start(): void {
	if (started || typeof window === "undefined") return;
	started = true;
	setInterval(() => setTick(Date.now()), TICK_MS);
	// Back on the tab after a while: catch up at once rather than on the next tick.
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "visible") setTick(Date.now());
	});
}

/**
 * The time, for labels that say how long ago or how soon ("2m", "in 13 h"): read inside the UI
 * it keeps them current, ticking every half minute and on returning to the tab.
 */
export function now(): number {
	start();
	return tick();
}
