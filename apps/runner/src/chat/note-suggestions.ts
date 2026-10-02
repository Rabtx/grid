/**
 * Agents suggest additions to the project's shared notes in their reply: a fenced block whose info
 * string is `grid-note` and the note's id. The runner keeps each one for the team to add or dismiss
 * on the note (Figma 14 · Notes, "suggests an addition"); nothing is written to a note unasked.
 */

/** A suggestion as an agent made it. */
export type NoteSuggestionDraft = { noteId: string; text: string };

/** At most this many per reply, each at most this long: a suggestion is a line or two, not a note. */
const MAX_PER_REPLY = 5;
const MAX_LENGTH = 4000;

const BLOCK =
	/```grid-note[ \t]+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})[ \t]*\n([\s\S]*?)\n?```/gi;

/** The suggestions in an agent's reply, for notes it was given (`known` ids); others are ignored. */
export function noteSuggestions(reply: string, known: ReadonlySet<string>): NoteSuggestionDraft[] {
	const found: NoteSuggestionDraft[] = [];
	for (const match of reply.matchAll(BLOCK)) {
		const noteId = match[1].toLowerCase();
		const text = match[2].trim();
		if (!known.has(noteId) || !text || text.length > MAX_LENGTH) continue;
		if (found.some((item) => item.noteId === noteId && item.text === text)) continue;
		found.push({ noteId, text });
		if (found.length === MAX_PER_REPLY) break;
	}
	return found;
}

/** The note ids a thread's shared notes carry (`note id: <uuid>` under each note's title). */
export function sharedNoteIds(notes: string): Set<string> {
	const ids = new Set<string>();
	for (const match of notes.matchAll(/note id: ([0-9a-f-]{36})/gi)) ids.add(match[1].toLowerCase());
	return ids;
}

/** How an agent is told it may suggest an addition, after the shared notes. */
export const SUGGEST_HOW =
	"If while working you learn something that belongs in one of these notes, suggest an addition: " +
	"end your reply with a fenced block whose info string is `grid-note` and the note's id, holding only " +
	"the text to add, for example:\n\n```grid-note <note id>\nThe text to add.\n```\n\n" +
	"The team decides whether to add it. Suggest only what is worth keeping, at most once per note.";
