/**
 * Speech to text, provider-agnostic. Two engines behind one shape:
 *
 * - `device`: the browser's own recogniser (Web Speech API). On Android it is the phone's speech
 *   service, on iOS and macOS Apple's; words stream in as they are spoken, and it costs nothing.
 * - `runner`: records with the microphone and sends the clip to the runner, which transcribes it
 *   with whatever the machine is configured for (any OpenAI-compatible transcription API, or a
 *   local command such as whisper.cpp). Used where the browser has no recogniser — Firefox, and
 *   Chromium builds without one.
 */

import { mergeTranscript } from "./transcript";

export type EngineKind = "device" | "runner";

export type EngineHandlers = {
	/** Words so far for the phrase in progress; replaced as the recogniser revises them. */
	onInterim: (text: string) => void;
	/** Everything that was said, once, when listening ends — ready to insert. */
	onFinal: (text: string) => void;
	/** Busy turning a recording into text (runner engine only). */
	onTranscribing: () => void;
	/** Listening stopped, after the last `onFinal`. */
	onEnd: () => void;
	onError: (error: DictationError) => void;
};

export type Engine = { kind: EngineKind; stop: () => void; cancel: () => void };

export class DictationError extends Error {
	constructor(
		message: string,
		/** The device engine cannot work here; the caller should switch to the runner. */
		readonly unsupported = false,
	) {
		super(message);
		this.name = "DictationError";
	}
}

// The recogniser's shape; TypeScript's DOM library declares its events but not the class.
type Recognition = EventTarget & {
	lang: string;
	continuous: boolean;
	interimResults: boolean;
	start: () => void;
	stop: () => void;
	abort: () => void;
	onresult: ((event: SpeechRecognitionEvent) => void) | null;
	onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
	onend: (() => void) | null;
};

type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | null {
	const scope = globalThis as unknown as {
		SpeechRecognition?: RecognitionConstructor;
		webkitSpeechRecognition?: RecognitionConstructor;
	};
	return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export function deviceEngineAvailable(): boolean {
	return recognitionConstructor() !== null;
}

// Errors that mean "this browser's recogniser cannot run here" rather than "try again".
const UNSUPPORTED_ERRORS = new Set(["network", "service-not-allowed", "language-not-supported"]);

export function startDeviceEngine(lang: string, handlers: EngineHandlers): Engine {
	const Constructor = recognitionConstructor();
	if (!Constructor) throw new DictationError("No speech recogniser in this browser", true);
	const recognition = new Constructor();
	recognition.lang = lang;
	recognition.continuous = true;
	recognition.interimResults = true;
	let failed = false;
	let cancelled = false;
	// The whole utterance so far. Inserted once, when listening ends: some recognisers (Android)
	// revise and re-send earlier words, so inserting phrase by phrase would repeat them.
	let heard = "";

	recognition.onresult = (event) => {
		let interim = "";
		for (let i = event.resultIndex; i < event.results.length; i++) {
			const result = event.results[i];
			const text = result[0]?.transcript ?? "";
			if (result.isFinal) heard = mergeTranscript(heard, text);
			else interim += text;
		}
		// Show the words live, including the phrase still being recognised.
		handlers.onInterim(interim.trim() ? mergeTranscript(heard, interim) : heard);
	};
	recognition.onerror = (event) => {
		// "no-speech" and "aborted" are normal endings, not failures.
		if (event.error === "no-speech" || event.error === "aborted") return;
		failed = true;
		if (event.error === "not-allowed") {
			handlers.onError(new DictationError("Microphone access was denied."));
		} else {
			handlers.onError(
				new DictationError(
					`Speech recognition failed (${event.error})`,
					UNSUPPORTED_ERRORS.has(event.error),
				),
			);
		}
	};
	recognition.onend = () => {
		handlers.onInterim("");
		if (failed) return;
		if (!cancelled && heard) handlers.onFinal(heard);
		handlers.onEnd();
	};
	recognition.start();

	return {
		kind: "device",
		stop: () => recognition.stop(),
		cancel: () => {
			cancelled = true;
			recognition.abort();
		},
	};
}

/** The best format this browser records in; the runner accepts any of them. */
function recordingType(): string | undefined {
	for (const type of [
		"audio/webm;codecs=opus",
		"audio/webm",
		"audio/ogg;codecs=opus",
		"audio/mp4",
	]) {
		if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) return type;
	}
	return undefined;
}

export async function startRunnerEngine(
	transcribe: (audio: Blob) => Promise<string>,
	handlers: EngineHandlers,
): Promise<Engine> {
	if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
		throw new DictationError("This browser cannot record audio.");
	}
	let stream: MediaStream;
	try {
		stream = await navigator.mediaDevices.getUserMedia({ audio: true });
	} catch {
		throw new DictationError("Microphone access was denied.");
	}
	const type = recordingType();
	const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
	const chunks: Blob[] = [];
	let cancelled = false;

	recorder.ondataavailable = (event) => {
		if (event.data.size > 0) chunks.push(event.data);
	};
	recorder.onstop = () => {
		for (const track of stream.getTracks()) track.stop();
		if (cancelled || chunks.length === 0) {
			handlers.onEnd();
			return;
		}
		handlers.onTranscribing();
		const audio = new Blob(chunks, { type: recorder.mimeType || type || "audio/webm" });
		transcribe(audio)
			.then((text) => {
				const phrase = text.trim();
				if (phrase) handlers.onFinal(phrase);
				handlers.onEnd();
			})
			.catch((cause: unknown) =>
				handlers.onError(
					cause instanceof DictationError
						? cause
						: new DictationError(cause instanceof Error ? cause.message : "Transcription failed"),
				),
			);
	};
	recorder.start();

	return {
		kind: "runner",
		stop: () => {
			if (recorder.state !== "inactive") recorder.stop();
		},
		cancel: () => {
			cancelled = true;
			if (recorder.state !== "inactive") recorder.stop();
		},
	};
}
