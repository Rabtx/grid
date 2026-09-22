"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/modules/auth/context/auth-context";
import { projectQueryKeys } from "../queries/project.queries";
import { projectsService } from "../services/projects.service";
import type { CreateProjectInput, CreateTaskInput, UpdateTaskInput } from "../types/project.types";

export function useCreateProjectMutation() {
	const { token } = useAuth();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: CreateProjectInput) => projectsService.create(requireToken(token), input),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: projectQueryKeys.list() }),
	});
}

export function useCreateTaskMutation(slug: string | null) {
	const { token } = useAuth();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: CreateTaskInput) =>
			projectsService.createTask(requireToken(token), requireSlug(slug), input),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: projectQueryKeys.tasks(slug ?? "") }),
	});
}

export function useUpdateTaskMutation(slug: string | null) {
	const { token } = useAuth();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ number, input }: { number: number; input: UpdateTaskInput }) =>
			projectsService.updateTask(requireToken(token), requireSlug(slug), number, input),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: projectQueryKeys.tasks(slug ?? "") }),
	});
}

export function useDeleteTaskMutation(slug: string | null) {
	const { token } = useAuth();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (number: number) =>
			projectsService.deleteTask(requireToken(token), requireSlug(slug), number),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: projectQueryKeys.tasks(slug ?? "") }),
	});
}

function requireToken(token: string | null): string {
	if (!token) throw new Error("Authentication required");
	return token;
}

function requireSlug(slug: string | null): string {
	if (!slug) throw new Error("A project is required");
	return slug;
}
