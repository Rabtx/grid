import { createSignal, untrack } from "solid-js";

import { localStore } from "@/lib/local-store";

import { projectsService } from "../services/projects.service";
import type { CreateNoteInput, Note } from "../types/project.types";

// Each project's notes, shared by the Notes page and "Add as note" in chat, so a note saved from
// a conversation is on the page when you open it.
const [byProject, setByProject] = createSignal<Record<string, Note[]>>({});
const [loaded, setLoaded] = createSignal<Record<string, boolean>>({});
const [errors, setErrors] = createSignal<Record<string, string | null>>({});
const pending = new Map<string, Promise<void>>();

const cacheKey = (project: string) => `notes:${project}`;

function put(project: string, list: Note[]): void {
	const sorted = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
		const work = (async () => {
			if (!untrack(loaded)[project]) {
				const cached = await localStore.get<Note[]>(cacheKey(project));
				if (cached && !untrack(loaded)[project]) {
					setByProject({ ...untrack(byProject), [project]: cached });
					setLoaded({ ...untrack(loaded), [project]: true });
				}
			}
			try {
				put(project, await projectsService.listNotes(token, project));
				setErrors({ ...untrack(errors), [project]: null });
			} catch (cause) {
				setErrors({
					...untrack(errors),
					[project]: cause instanceof Error ? cause.message : "Could not load the notes",
				});
			} finally {
				setLoaded({ ...untrack(loaded), [project]: true });
				pending.delete(project);
			}
		})();
		pending.set(project, work);
		return work;
	},

	async add(token: string, project: string, input: CreateNoteInput): Promise<Note> {
		const note = await projectsService.createNote(token, project, input);
		put(project, [note, ...current(project).filter((item) => item.id !== note.id)]);
		return note;
	},

	async update(token: string, project: string, id: string, body: string): Promise<void> {
		const note = await projectsService.updateNote(token, project, id, body);
		put(
			project,
			current(project).map((item) => (item.id === id ? note : item)),
		);
	},

	async remove(token: string, project: string, id: string): Promise<void> {
		await projectsService.deleteNote(token, project, id);
		put(
			project,
			current(project).filter((item) => item.id !== id),
		);
	},
};
