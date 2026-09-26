import { apiClient } from "@/lib/api-client";

import type { CreateWorkspaceInput, Workspace } from "../types/workspace.types";

export const workspacesService = {
	list: (accessToken: string) => apiClient.get<Workspace[]>("/workspaces", { accessToken }),
	create: (accessToken: string, input: CreateWorkspaceInput) =>
		apiClient.post<Omit<Workspace, "isDefault">>("/workspaces", input, { accessToken }),
};
