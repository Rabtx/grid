import { inWorkspace } from "@/lib/active-workspace";
import { apiClient } from "@/lib/api-client";

import type {
	CreateNoteInput,
	CreateProjectInput,
	CreateTaskInput,
	Note,
	NotePatch,
	Project,
	Task,
	UpdateProjectInput,
	UpdateTaskInput,
} from "../types/project.types";

export const projectsService = {
	list: (accessToken: string) =>
		apiClient.get<Project[]>(inWorkspace("/projects"), { accessToken }),
	create: (accessToken: string, input: CreateProjectInput) =>
		apiClient.post<Project>(inWorkspace("/projects"), input, { accessToken }),
	update: (accessToken: string, slug: string, input: UpdateProjectInput) =>
		apiClient.patch<Project>(inWorkspace(`/projects/${slug}`), input, { accessToken }),
	listTasks: (accessToken: string, slug: string) =>
		apiClient.get<Task[]>(inWorkspace(`/projects/${slug}/tasks`), { accessToken }),
	createTask: (accessToken: string, slug: string, input: CreateTaskInput) =>
		apiClient.post<Task>(inWorkspace(`/projects/${slug}/tasks`), input, { accessToken }),
	updateTask: (accessToken: string, slug: string, number: number, input: UpdateTaskInput) =>
		apiClient.patch<Task>(inWorkspace(`/projects/${slug}/tasks/${number}`), input, { accessToken }),
	deleteTask: (accessToken: string, slug: string, number: number) =>
		apiClient.delete<void>(inWorkspace(`/projects/${slug}/tasks/${number}`), { accessToken }),
	listNotes: (accessToken: string, slug: string) =>
		apiClient.get<Note[]>(inWorkspace(`/projects/${slug}/notes`), { accessToken }),
	createNote: (accessToken: string, slug: string, input: CreateNoteInput) =>
		apiClient.post<Note>(inWorkspace(`/projects/${slug}/notes`), input, { accessToken }),
	updateNote: (accessToken: string, slug: string, id: string, patch: NotePatch) =>
		apiClient.patch<Note>(inWorkspace(`/projects/${slug}/notes/${id}`), patch, { accessToken }),
	deleteNote: (accessToken: string, slug: string, id: string) =>
		apiClient.delete<void>(inWorkspace(`/projects/${slug}/notes/${id}`), { accessToken }),
	/** Keep an image with a note; the answer is its address, for the note's Markdown. */
	addNoteImage: (accessToken: string, slug: string, id: string, file: File) => {
		const form = new FormData();
		form.set("file", file);
		return apiClient.upload<{ url: string }>(
			inWorkspace(`/projects/${slug}/notes/${id}/images`),
			form,
			{ accessToken },
		);
	},
};
