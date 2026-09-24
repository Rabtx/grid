import { describe, expect, it } from "vitest";

import { mergeTranscript } from "./transcript";

function fold(phrases: string[]): string {
	return phrases.reduce(mergeTranscript, "");
}

describe("mergeTranscript", () => {
	it("keeps Android's cumulative results as one sentence, not a pile of repeats", () => {
		// What the phone actually sent for "hello how are you".
		expect(fold(["hello", "hello", "hello how", "hello how are you", "hello how are you"])).toBe(
			"hello how are you",
		);
		expect(fold(["okay", "okay", "okay that's okay", "okay that's okay t"])).toBe(
			"okay that's okay t",
		);
	});

	it("joins separate phrases the way desktop recognisers send them", () => {
		expect(fold(["open the board", "and show me the backlog"])).toBe(
			"open the board and show me the backlog",
		);
	});

	it("ignores case and punctuation differences between takes", () => {
		expect(fold(["Hello", "hello, how are you?"])).toBe("hello, how are you?");
		// The same words again: the newer take wins, as the recogniser revised them.
		expect(fold(["run the tests.", "run the tests"])).toBe("run the tests");
	});

	it("skips empty results", () => {
		expect(fold(["git status", "  "])).toBe("git status");
	});
});
