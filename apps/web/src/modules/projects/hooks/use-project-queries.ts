"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/modules/auth/context/auth-context";
import { projectQueryKeys } from "../queries/project.queries";
import { projectsService } from "../services/projects.service";

export function useProjectsQuery() {
	const { token } = useAuth();
	return useQuery({
		queryKey: projectQueryKeys.list(),
		queryFn: () => projectsService.list(requireToken(token)),
		enabled: Boolean(token),
	});
}

export function useProjectTasksQuery(slug: string | null) {
	const { token } = useAuth();
	return useQuery({
		queryKey: projectQueryKeys.tasks(slug ?? ""),
		queryFn: () => projectsService.listTasks(requireToken(token), requireSlug(slug)),
		enabled: Boolean(token) && Boolean(slug),
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
