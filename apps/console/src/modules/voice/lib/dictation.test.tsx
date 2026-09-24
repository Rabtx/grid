import { flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { configureTranscription, dictation } from "./dictation";
import { insertIntoField, registerDictationTarget, targetFor } from "./dictation-target";

/** A recogniser the test drives: `emit` delivers results the way the browser does. */
class FakeRecognition extends EventTarget {
	static last: FakeRecognition | null = null;
	lang = "";
	continuous = false;
	interimResults = false;
	onresult: ((event: unknown) => void) | null = null;
	onerror: ((event: { error: string }) => void) | null = null;
	onend: (() => void) | null = null;
	constructor() {
		super();
		FakeRecognition.last = this;
	}
	start(): void {}
	stop(): void {
		this.onend?.();
	}
	abort(): void {
		this.onend?.();
	}
	emit(results: { text: string; final: boolean }[]): void {
		const list = results.map((result) =>
			Object.assign([{ transcript: result.text }], { isFinal: result.final }),
		);
		this.onresult?.({ resultIndex: 0, results: list });
	}
}

describe("insertIntoField", () => {
	it("inserts at the caret, spaces it from the word before, and fires input", () => {
		const input = document.createElement("input");
		input.value = "open the";
		input.setSelectionRange(8, 8);
		const onInput = vi.fn();
		input.addEventListener("input", onInput);
		insertIntoField(input, "task panel");
		expect(input.value).toBe("open the task panel");
		expect(onInput).toHaveBeenCalledOnce();
	});

	it("replaces a selection", () => {
		const input = document.createElement("textarea");
		input.value = "fix the bug now";
		input.setSelectionRange(8, 11);
		insertIntoField(input, "login");
		expect(input.value).toBe("fix the login now");
	});
});

describe("targetFor", () => {
	afterEach(() => document.body.replaceChildren());

	it("prefers a registered surface over the plain field inside it", () => {
		const host = document.createElement("div");
		const hidden = document.createElement("textarea");
		host.append(hidden);
		document.body.append(host);
		const insert = vi.fn();
		const unregister = registerDictationTarget(host, {
			insert,
			label: "Terminal",
			floatingMic: false,
		});
		const target = targetFor(hidden);
		target?.insert("ls");
		expect(insert).toHaveBeenCalledWith("ls");
		expect(target?.label).toBe("Terminal");
		expect(target?.floatingMic).toBe(false);
		unregister();
		expect(targetFor(hidden)?.label).toBe("Text field");
	});

	it("ignores things that are not for typing", () => {
		const checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		expect(targetFor(checkbox)).toBeNull();
		expect(targetFor(document.createElement("button"))).toBeNull();
	});
});

describe("dictation", () => {
	beforeEach(() => {
		vi.stubGlobal("SpeechRecognition", FakeRecognition);
		localStorage.clear();
	});
	afterEach(() => {
		dictation.cancel();
		vi.unstubAllGlobals();
	});

	function target() {
		const inserted: string[] = [];
		return {
			inserted,
			target: {
				insert: (text: string) => inserted.push(text),
				focus: () => {},
				label: "Test",
				floatingMic: true,
			},
		};
	}

	it("shows words as they come and inserts the whole utterance once, on stop", () => {
		const { inserted, target: into } = target();
		dictation.toggle(into);
		flush();
		expect(dictation.status()).toBe("listening");
		FakeRecognition.last?.emit([{ text: "run the", final: false }]);
		flush();
		expect(dictation.interim()).toBe("run the");
		FakeRecognition.last?.emit([{ text: "run the tests", final: true }]);
		FakeRecognition.last?.emit([{ text: "and lint", final: true }]);
		expect(inserted).toEqual([]);
		dictation.toggle(into);
		flush();
		expect(inserted).toEqual(["run the tests and lint"]);
		expect(dictation.status()).toBe("idle");
	});

	it("does not repeat words when the recogniser re-sends what was already said", () => {
		const { inserted, target: into } = target();
		dictation.toggle(into);
		// Android's speech service: every result is final and holds the sentence so far.
		for (const text of ["hello", "hello", "hello how", "hello how are you", "hello how are you"]) {
			FakeRecognition.last?.emit([{ text, final: true }]);
		}
		dictation.toggle(into);
		expect(inserted).toEqual(["hello how are you"]);
	});

	it("inserts nothing when cancelled", () => {
		const { inserted, target: into } = target();
		dictation.toggle(into);
		FakeRecognition.last?.emit([{ text: "never mind", final: true }]);
		dictation.cancel();
		expect(inserted).toEqual([]);
	});

	it("asks for a place to type when there is none", () => {
		dictation.toggle(null);
		flush();
		expect(dictation.status()).toBe("idle");
		expect(dictation.error()).toContain("text field");
		dictation.dismissError();
	});

	it("falls back to the runner when the browser's recogniser cannot run here", async () => {
		const run = vi.fn(async () => "hello from the runner");
		configureTranscription(run);
		const getUserMedia = vi.fn(async () => ({ getTracks: () => [] }));
		vi.stubGlobal("navigator", { ...navigator, language: "en-US", mediaDevices: { getUserMedia } });
		class FakeRecorder {
			static isTypeSupported = () => true;
			state = "inactive";
			mimeType = "audio/webm";
			ondataavailable: ((event: { data: Blob }) => void) | null = null;
			onstop: (() => void) | null = null;
			start() {
				this.state = "recording";
			}
			stop() {
				this.state = "inactive";
				this.ondataavailable?.({ data: new Blob(["x"]) });
				this.onstop?.();
			}
		}
		vi.stubGlobal("MediaRecorder", FakeRecorder);

		const { inserted, target: into } = target();
		dictation.toggle(into);
		FakeRecognition.last?.onerror?.({ error: "network" });
		await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalled());
		expect(localStorage.getItem("grid.voice.engine")).toBe("runner");
		dictation.toggle(into);
		await vi.waitFor(() => expect(inserted).toEqual(["hello from the runner"]));
		flush();
		expect(dictation.status()).toBe("idle");
	});
});
