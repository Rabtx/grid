import { createSignal, untrack } from "solid-js";

import { chatService } from "../services/chat.service";
import type { ChatSession } from "../types/chat.types";

// Each project's threads, shared by the sidebar tree and the chat screen, so a rename or a new
// thread shows everywhere at once.
const [byProject, setByProject] = createSignal<Record<string, ChatSession[]>>({});
const [loaded, setLoaded] = createSignal<Record<string, boolean>>({});
const [errors, setErrors] = createSignal<Record<string, string | null>>({});
const pending = new Map<string, Promise<void>>();

const newestFirst = (list: ChatSession[]) =>
	[...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

function put(project: string, list: ChatSession[]): void {
	setByProject({ ...untrack(byProject), [project]: newestFirst(list) });
}

export const threadsStore = {
	threads: (project: string): ChatSession[] => byProject()[project] ?? [],
	loaded: (project: string): boolean => loaded()[project] === true,
	error: (project: string): string | null => errors()[project] ?? null,
	/** Read a project's threads; calls while one is in flight share it. */
	load(token: string, project: string): Promise<void> {
		const running = pending.get(project);
		if (running) return running;
		const work = chatService
			.sessions(token, project)
			.then(
				(list) => {
					put(project, list);
					setErrors({ ...untrack(errors), [project]: null });
				},
				(cause: unknown) => {
					setErrors({
						...untrack(errors),
						[project]: cause instanceof Error ? cause.message : "Could not load threads",
					});
				},
			)
			.finally(() => {
				pending.delete(project);
				setLoaded({ ...untrack(loaded), [project]: true });
			});
		pending.set(project, work);
		return work;
	},
	/** A thread was created or changed (a new title, a new message). */
	upsert(session: ChatSession): void {
		const rest = (untrack(byProject)[session.project] ?? []).filter(
			(item) => item.id !== session.id,
		);
		put(session.project, [session, ...rest]);
	},
	async rename(token: string, session: ChatSession, title: string): Promise<void> {
		await chatService.rename(token, session.id, title);
		threadsStore.upsert({ ...session, title });
	},
	async remove(token: string, session: ChatSession): Promise<void> {
		await chatService.remove(token, session.id);
		put(
			session.project,
			(untrack(byProject)[session.project] ?? []).filter((item) => item.id !== session.id),
		);
	},
};
