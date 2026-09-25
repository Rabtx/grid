import { apiClient } from "@/lib/api-client";

import type {
	CreateNoteInput,
	CreateProjectInput,
	CreateTaskInput,
	Note,
	Project,
	Task,
	UpdateProjectInput,
	UpdateTaskInput,
} from "../types/project.types";

export const projectsService = {
	list: (accessToken: string) => apiClient.get<Project[]>("/projects", { accessToken }),
	create: (accessToken: string, input: CreateProjectInput) =>
		apiClient.post<Project>("/projects", input, { accessToken }),
	update: (accessToken: string, slug: string, input: UpdateProjectInput) =>
		apiClient.patch<Project>(`/projects/${slug}`, input, { accessToken }),
	listTasks: (accessToken: string, slug: string) =>
		apiClient.get<Task[]>(`/projects/${slug}/tasks`, { accessToken }),
	createTask: (accessToken: string, slug: string, input: CreateTaskInput) =>
		apiClient.post<Task>(`/projects/${slug}/tasks`, input, { accessToken }),
	updateTask: (accessToken: string, slug: string, number: number, input: UpdateTaskInput) =>
		apiClient.patch<Task>(`/projects/${slug}/tasks/${number}`, input, { accessToken }),
	deleteTask: (accessToken: string, slug: string, number: number) =>
		apiClient.delete<void>(`/projects/${slug}/tasks/${number}`, { accessToken }),
	listNotes: (accessToken: string, slug: string) =>
		apiClient.get<Note[]>(`/projects/${slug}/notes`, { accessToken }),
	createNote: (accessToken: string, slug: string, input: CreateNoteInput) =>
		apiClient.post<Note>(`/projects/${slug}/notes`, input, { accessToken }),
	updateNote: (accessToken: string, slug: string, id: string, body: string) =>
		apiClient.patch<Note>(`/projects/${slug}/notes/${id}`, { body }, { accessToken }),
	deleteNote: (accessToken: string, slug: string, id: string) =>
		apiClient.delete<void>(`/projects/${slug}/notes/${id}`, { accessToken }),
};
