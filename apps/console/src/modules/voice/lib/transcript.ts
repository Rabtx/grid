function normalise(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim();
}

/**
 * Fold one finished phrase into what has been said so far. Recognisers disagree on what a
 * "final" result is: desktop Chrome and Safari send each phrase once, while Android's speech
 * service re-sends everything said so far ("hello", "hello how", "hello how are you"), each marked
 * final. Treating every result as new text doubles the words, so a phrase that repeats or extends
 * what is already there replaces it instead of being appended.
 */
export function mergeTranscript(sofar: string, phrase: string): string {
	const next = phrase.trim();
	if (!next) return sofar;
	if (!sofar) return next;
	const before = normalise(sofar);
	const after = normalise(next);
	// A longer take on the same words (Android's cumulative results): keep the newer, fuller one.
	if (after.startsWith(before)) return next;
	// The same words again, or a shorter repeat of the end: nothing new.
	if (before === after || before.endsWith(after)) return sofar;
	return `${sofar} ${next}`;
}
