import { createSignal, untrack } from "solid-js";

import { localStore } from "@/lib/local-store";
import { runnerCall } from "@/lib/runner-client";
import { placementsStore } from "@/modules/environments";

import { splitNote } from "../lib/note-doc";
import { projectsService } from "../services/projects.service";
import type { CreateNoteInput, Note, NotePatch, NoteSuggestion } from "../types/project.types";

// Each project's notes, shared by the Notes page and "Add as note" in chat, so a note saved from
// a conversation is on the page when you open it.
const [byProject, setByProject] = createSignal<Record<string, Note[]>>({});
const [loaded, setLoaded] = createSignal<Record<string, boolean>>({});
const [errors, setErrors] = createSignal<Record<string, string | null>>({});
const pending = new Map<string, Promise<void>>();
// What agents suggested adding to each project's notes (kept by the runner the project runs on).
const [suggested, setSuggested] = createSignal<Record<string, NoteSuggestion[]>>({});
const suggestionsPath = (project: string, id?: string) =>
	`${placementsStore.scopeOf(project)}/chat/notes/${project}/suggestions${id ? `/${id}` : ""}`;
// Each note's changes in flight, so they reach the API (and come back) in the order made.
const queues = new Map<string, Promise<Note>>();
// Notes changed while a list was in flight must survive its older snapshot (deletions too).
const changedDuringRead = new Map<string, Set<string>>();
function changed(project: string, id: string): void {
	changedDuringRead.get(project)?.add(id);
}
localStore.onUserChange(() => {
	setByProject({});
	setLoaded({});
	setErrors({});
	setSuggested({});
	pending.clear();
	queues.clear();
	changedDuringRead.clear();
});

const cacheKey = (project: string) => `notes:${project}`;

/** What a new thread in the project is given (characters); the runner takes no more. */
const SHARED_LIMIT = 60_000;

function put(project: string, list: Note[]): void {
	// Most recently changed first, as the list shows them.
	const sorted = [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	setByProject({ ...untrack(byProject), [project]: sorted });
	// Kept on the device: the notes show at once next time, offline included.
	void localStore.set(cacheKey(project), sorted);
}

function current(project: string): Note[] {
	return untrack(byProject)[project] ?? [];
}

export const notesStore = {
	notes: (project: string): Note[] => byProject()[project] ?? [],
	loaded: (project: string): boolean => loaded()[project] ?? false,
	error: (project: string): string | null => errors()[project] ?? null,

	/** Show the device's copy straight away, then the API's. */
	load(token: string, project: string): Promise<void> {
		const inFlight = pending.get(project);
		if (inFlight) return inFlight;
		const started = localStore.version();
		const changedIds = new Set<string>();
		changedDuringRead.set(project, changedIds);
		const work = (async () => {
			if (!untrack(loaded)[project]) {
				const cached = await localStore.get<Note[]>(cacheKey(project));
				if (
					started === localStore.version() &&
					cached &&
					!untrack(loaded)[project] &&
					changedIds.size === 0
				) {
					setByProject({ ...untrack(byProject), [project]: cached });
					setLoaded({ ...untrack(loaded), [project]: true });
				}
			}
			try {
				if (started !== localStore.version()) return;
				const list = await projectsService.listNotes(token, project);
				if (started !== localStore.version()) return;
				put(project, [
					...list.filter((item) => !changedIds.has(item.id)),
					...current(project).filter((item) => changedIds.has(item.id)),
				]);
				setErrors({ ...untrack(errors), [project]: null });
			} catch (cause) {
				if (started !== localStore.version()) return;
				setErrors({
					...untrack(errors),
					[project]: cause instanceof Error ? cause.message : "Could not load the notes",
				});
			} finally {
				if (started === localStore.version()) {
					setLoaded({ ...untrack(loaded), [project]: true });
					pending.delete(project);
					changedDuringRead.delete(project);
				}
			}
		})();
		pending.set(project, work);
		return work;
	},

	async add(token: string, project: string, input: CreateNoteInput): Promise<Note> {
		const started = localStore.version();
		const note = await projectsService.createNote(token, project, input);
		if (started !== localStore.version()) return note;
		changed(project, note.id);
		put(project, [note, ...current(project).filter((item) => item.id !== note.id)]);
		return note;
	},

	/**
	 * Change a note. Pinning, sharing and its glyph show at once and go back if the API refuses;
	 * a new text shows once it is saved. Changes to one note go one after another, and each answer
	 * only updates what it changed, so a late answer never puts back an older text or flag.
	 */
	update(token: string, project: string, id: string, patch: NotePatch): Promise<Note> {
		const started = localStore.version();
		changed(project, id);
		const flags = patch.body === undefined;
		const before = current(project).find((item) => item.id === id);
		if (before && flags) {
			setByProject({
				...untrack(byProject),
				[project]: current(project).map((item) => (item.id === id ? { ...item, ...patch } : item)),
			});
		}
		const key = `${project}/${id}`;
		const previous = queues.get(key) ?? Promise.resolve();
		const run = previous
			.catch(() => {})
			.then(() => {
				if (started !== localStore.version())
					throw new Error("This account is no longer signed in");
				return projectsService.updateNote(token, project, id, patch);
			})
			.then(
				(note) => {
					if (started !== localStore.version()) return note;
					changed(project, id);
					const fields: Partial<Note> = flags
						? {
								...(patch.pinned !== undefined ? { pinned: note.pinned } : {}),
								...(patch.shared !== undefined ? { shared: note.shared } : {}),
								...(patch.icon !== undefined ? { icon: note.icon } : {}),
								...(patch.agents !== undefined ? { agents: note.agents } : {}),
							}
						: {
								body: note.body,
								updatedAt: note.updatedAt,
								editor: note.editor,
								author: note.author,
							};
					put(
						project,
						current(project).map((item) => (item.id === id ? { ...item, ...fields } : item)),
					);
					return current(project).find((item) => item.id === id) ?? note;
				},
				(cause: unknown) => {
					if (started === localStore.version() && before && flags) {
						const undo: Partial<Note> = {
							...(patch.pinned !== undefined ? { pinned: before.pinned } : {}),
							...(patch.shared !== undefined ? { shared: before.shared } : {}),
							...(patch.icon !== undefined ? { icon: before.icon } : {}),
							...(patch.agents !== undefined ? { agents: before.agents } : {}),
						};
						setByProject({
							...untrack(byProject),
							[project]: current(project).map((item) =>
								item.id === id ? { ...item, ...undo } : item,
							),
						});
					}
					throw cause;
				},
			);
		queues.set(key, run);
		void run
			.catch(() => {})
			.then(() => {
				if (queues.get(key) === run) queues.delete(key);
			});
		return run;
	},

	/**
	 * The notes the project shares with agents, as one text for a new thread to start with (pinned
	 * first); undefined when none are shared or they cannot be read — a thread still starts.
	 */
	async sharedText(
		token: string,
		project: string,
		/** The agent the thread starts with: a note meant for other agents is left out. */
		agent?: string,
	): Promise<string | undefined> {
		// A read in flight (or none yet) is waited for, so the thread gets the API's copy — but
		// not for long: a thread is never held up by its notes.
		const started = localStore.version();
		const reading =
			pending.get(project) ?? (untrack(loaded)[project] ? null : notesStore.load(token, project));
		if (reading) await Promise.race([reading, new Promise((resolve) => setTimeout(resolve, 2500))]);
		if (started !== localStore.version()) return undefined;
		const shared = current(project)
			.filter(
				(note) => note.shared && (!agent || note.agents === null || note.agents.includes(agent)),
			)
			.sort((a, b) => Number(b.pinned) - Number(a.pinned));
		let text = "";
		let left = 0;
		for (const note of shared) {
			// Each under its title and id, so an agent can suggest an addition to that note.
			const { title, rest } = splitNote(note.body);
			const header = `## ${title || "Note"}\nnote id: ${note.id}`;
			const block = rest.trim() ? `${header}\n\n${rest.trim()}` : header;
			const next = text ? `${text}\n\n---\n\n${block}` : block;
			if (next.length > SHARED_LIMIT) left++;
			else text = next;
		}
		if (left && text)
			text += `\n\n(${left} more shared note${left === 1 ? " was" : "s were"} left out: too long to send.)`;
		return text || undefined;
	},

	/** The additions agents suggested to a note, oldest first. */
	suggestions: (project: string, noteId: string): NoteSuggestion[] =>
		(suggested()[project] ?? []).filter((item) => item.noteId === noteId),

	/** Read what agents suggested for the project's notes; an unreachable runner means none. */
	async loadSuggestions(token: string, project: string): Promise<void> {
		const started = localStore.version();
		try {
			const list = await runnerCall<NoteSuggestion[]>(suggestionsPath(project), token);
			if (started !== localStore.version()) return;
			setSuggested({ ...untrack(suggested), [project]: list });
		} catch {
			if (started !== localStore.version()) return;
			setSuggested({ ...untrack(suggested), [project]: [] });
		}
	},

	/** Let a suggestion go: gone from the note at once, back if the runner refuses. */
	async dismissSuggestion(token: string, project: string, id: string): Promise<void> {
		const started = localStore.version();
		const before = untrack(suggested)[project] ?? [];
		setSuggested({ ...untrack(suggested), [project]: before.filter((item) => item.id !== id) });
		try {
			await runnerCall<void>(suggestionsPath(project, id), token, { method: "DELETE" });
		} catch (cause) {
			if (started === localStore.version())
				setSuggested({ ...untrack(suggested), [project]: before });
			throw cause;
		}
	},

	/** Add a suggestion to its note (a new paragraph at the end), then let it go. */
	async acceptSuggestion(
		token: string,
		project: string,
		suggestion: NoteSuggestion,
	): Promise<Note> {
		const started = localStore.version();
		const note = current(project).find((item) => item.id === suggestion.noteId);
		if (!note) throw new Error("That note is no longer here");
		const saved = await notesStore.update(token, project, note.id, {
			body: `${note.body.trimEnd()}\n\n${suggestion.text.trim()}`,
		});
		if (started !== localStore.version()) return saved;
		await notesStore.dismissSuggestion(token, project, suggestion.id).catch(() => undefined);
		return saved;
	},

	async remove(token: string, project: string, id: string): Promise<void> {
		const started = localStore.version();
		await projectsService.deleteNote(token, project, id);
		if (started !== localStore.version()) return;
		changed(project, id);
		put(
			project,
			current(project).filter((item) => item.id !== id),
		);
	},
};
