import { apiClient } from "@/lib/api-client";

import type { CreateWorkspaceInput, InvitePreview, Workspace } from "../types/workspace.types";

export const workspacesService = {
	list: (accessToken: string) => apiClient.get<Workspace[]>("/workspaces", { accessToken }),
	create: (accessToken: string, input: CreateWorkspaceInput) =>
		apiClient.post<Omit<Workspace, "isDefault">>("/workspaces", input, { accessToken }),
	previewInvite: (token: string) =>
		apiClient.get<InvitePreview>(`/invites/${encodeURIComponent(token)}`),
	acceptInvite: (token: string, accessToken: string) =>
		apiClient.post<unknown>(`/invites/${encodeURIComponent(token)}/accept`, undefined, {
			accessToken,
		}),
};
