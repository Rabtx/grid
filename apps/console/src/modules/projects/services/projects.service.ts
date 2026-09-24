import { apiClient } from "@/lib/api-client";

import type {
	CreateProjectInput,
	CreateTaskInput,
	Project,
	Task,
	UpdateTaskInput,
} from "../types/project.types";

export const projectsService = {
	list: (accessToken: string) => apiClient.get<Project[]>("/projects", { accessToken }),
	create: (accessToken: string, input: CreateProjectInput) =>
		apiClient.post<Project>("/projects", input, { accessToken }),
	listTasks: (accessToken: string, slug: string) =>
		apiClient.get<Task[]>(`/projects/${slug}/tasks`, { accessToken }),
	createTask: (accessToken: string, slug: string, input: CreateTaskInput) =>
		apiClient.post<Task>(`/projects/${slug}/tasks`, input, { accessToken }),
	updateTask: (accessToken: string, slug: string, number: number, input: UpdateTaskInput) =>
		apiClient.patch<Task>(`/projects/${slug}/tasks/${number}`, input, { accessToken }),
	deleteTask: (accessToken: string, slug: string, number: number) =>
		apiClient.delete<void>(`/projects/${slug}/tasks/${number}`, { accessToken }),
};
