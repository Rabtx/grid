import { describe, expect, it } from "bun:test";

import { noteSuggestions, sharedNoteIds } from "./note-suggestions";

const ETA = "6f1c2a3b-1d2e-4f50-8a9b-0c1d2e3f4a5b";
const OTHER = "7a1c2a3b-1d2e-4f50-8a9b-0c1d2e3f4a5b";

describe("note suggestions", () => {
	it("reads the notes a thread was given by their ids", () => {
		const notes = `## Dispatch ETA rules\nnote id: ${ETA}\n\nRound to 5.\n\n---\n\n## Old\n\nNo id.`;
		expect([...sharedNoteIds(notes)]).toEqual([ETA]);
	});

	it("takes grid-note blocks for known notes, once each, and nothing else", () => {
		const reply = [
			"Done. Rounding is fixed.",
			"```grid-note " + ETA,
			"Under 2 minutes, show “Arriving now”.",
			"```",
			"```grid-note " + ETA,
			"Under 2 minutes, show “Arriving now”.",
			"```",
			"```grid-note " + OTHER,
			"Not a note this thread was given.",
			"```",
			"```ts",
			"const x = 1;",
			"```",
		].join("\n");
		expect(noteSuggestions(reply, new Set([ETA]))).toEqual([
			{ noteId: ETA, text: "Under 2 minutes, show “Arriving now”." },
		]);
		expect(noteSuggestions("No suggestions here.", new Set([ETA]))).toEqual([]);
	});
});
