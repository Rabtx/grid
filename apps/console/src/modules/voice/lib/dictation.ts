import { createSignal } from "solid-js";

import type { DictationTarget } from "./dictation-target";
import {
	DictationError,
	deviceEngineAvailable,
	type Engine,
	type EngineHandlers,
	type EngineKind,
	startDeviceEngine,
	startRunnerEngine,
} from "./speech-engines";

export type DictationStatus = "idle" | "listening" | "transcribing";

// Once the device recogniser has proven it cannot work in this browser, go straight to the runner.
const ENGINE_KEY = "grid.voice.engine";

function preferredEngine(): EngineKind {
	try {
		if (localStorage.getItem(ENGINE_KEY) === "runner") return "runner";
	} catch {
		// Storage unavailable: decide from the browser alone.
	}
	return deviceEngineAvailable() ? "device" : "runner";
}

function rememberRunner(): void {
	try {
		localStorage.setItem(ENGINE_KEY, "runner");
	} catch {
		// Not remembered; the fallback still happens on the next failure.
	}
}

const [status, setStatus] = createSignal<DictationStatus>("idle");
const [interim, setInterim] = createSignal("");
const [error, setError] = createSignal<string | null>(null);
const [targetLabel, setTargetLabel] = createSignal<string | null>(null);
const [owner, setOwner] = createSignal<object | null>(null);
const [startedAt, setStartedAt] = createSignal<number | null>(null);
// The latest loudness readings, oldest first, for a waveform; empty when the engine has none.
const [levels, setLevels] = createSignal<readonly number[]>([]);
const LEVELS_KEPT = 96;

let engine: Engine | null = null;
// Starting can take a moment (the microphone permission prompt); a tap meanwhile means "stop".
let starting = false;
let stopRequested = false;
// Cancelled while starting: the engine that arrives is dropped unheard.
let cancelRequested = false;
let target: DictationTarget | null = null;
let transcribe: ((audio: Blob) => Promise<string>) | null = null;

/** How the runner engine reaches the runner; set once by the mounted voice controls. */
export function configureTranscription(run: (audio: Blob) => Promise<string>): void {
	transcribe = run;
}

function finish(): void {
	engine = null;
	setStatus("idle");
	setInterim("");
	setOwner(null);
	setStartedAt(null);
	setLevels([]);
}

async function start(into: DictationTarget, kind: EngineKind): Promise<void> {
	target = into;
	setError(null);
	setTargetLabel(into.label);
	cancelRequested = false;
	setOwner(into.owner ?? null);
	setStartedAt(Date.now());
	setLevels([]);
	setStatus("listening");

	const handlers: EngineHandlers = {
		onInterim: setInterim,
		onFinal: (text) => target?.insert(text),
		onTranscribing: () => setStatus("transcribing"),
		onEnd: finish,
		onLevel: (level) => {
			// A reading or two can land after a cancel; the bar is gone by then.
			if (status() === "idle") return;
			setLevels((kept) => [...kept.slice(1 - LEVELS_KEPT), level]);
		},
		onError: (cause) => {
			engine = null;
			if (cause.unsupported && kind === "device") {
				// This browser has a recogniser that cannot run here: use the runner from now on.
				rememberRunner();
				void start(into, "runner");
				return;
			}
			finish();
			setError(cause.message);
		},
	};

	starting = true;
	try {
		if (kind === "device") {
			engine = startDeviceEngine(navigator.language || "en-US", handlers);
		} else {
			if (!transcribe) throw new DictationError("Voice input is not ready yet.");
			engine = await startRunnerEngine(transcribe, handlers);
		}
	} catch (cause) {
		finish();
		if (!cancelRequested) {
			setError(cause instanceof Error ? cause.message : "Voice input could not start.");
		}
	} finally {
		starting = false;
	}
	if (cancelRequested) {
		cancelRequested = false;
		stopRequested = false;
		engine?.cancel();
		finish();
		return;
	}
	if (stopRequested) {
		stopRequested = false;
		engine?.stop();
	}
}

export const dictation = {
	status,
	interim,
	error,
	targetLabel,
	/** Whose own dictation UI is showing this, if the target draws it (the composer). */
	owner,
	/** When listening began, for a timer. */
	startedAt,
	/** Recent microphone loudness, 0 to 1, oldest first; empty for the device engine. */
	levels,
	/** Start listening into `into`, or stop (and insert what was said) if already listening. */
	toggle(into: DictationTarget | null): void {
		if (engine) {
			engine.stop();
			return;
		}
		if (starting) {
			stopRequested = true;
			return;
		}
		if (status() === "transcribing") return;
		if (!into) {
			setError("Tap into a text field or the terminal first, then the mic.");
			return;
		}
		into.focus();
		void start(into, preferredEngine());
	},
	/** Stop without inserting anything. */
	cancel(): void {
		stopRequested = false;
		// Still waiting on the microphone (its permission prompt): drop it when it comes.
		if (starting) cancelRequested = true;
		engine?.cancel();
		finish();
	},
	dismissError(): void {
		setError(null);
	},
};
