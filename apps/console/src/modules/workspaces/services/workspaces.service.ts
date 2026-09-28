import { apiClient } from "@/lib/api-client";

import type {
	CreatedInvite,
	CreateInviteInput,
	CreateWorkspaceInput,
	Invite,
	InvitePreview,
	Member,
	Workspace,
	WorkspaceRole,
} from "../types/workspace.types";

const at = (slug: string) => `/workspaces/${encodeURIComponent(slug)}`;

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
	members: (accessToken: string, slug: string) =>
		apiClient.get<Member[]>(`${at(slug)}/members`, { accessToken }),
	setRole: (accessToken: string, slug: string, userId: string, role: WorkspaceRole) =>
		apiClient.patch<Member>(`${at(slug)}/members/${userId}`, { role }, { accessToken }),
	/** Remove someone, or leave when it is you. */
	removeMember: (accessToken: string, slug: string, userId: string) =>
		apiClient.delete<void>(`${at(slug)}/members/${userId}`, { accessToken }),
	invites: (accessToken: string, slug: string) =>
		apiClient.get<Invite[]>(`${at(slug)}/invites`, { accessToken }),
	createInvite: (accessToken: string, slug: string, input: CreateInviteInput) =>
		apiClient.post<CreatedInvite>(`${at(slug)}/invites`, input, { accessToken }),
	revokeInvite: (accessToken: string, slug: string, id: string) =>
		apiClient.delete<void>(`${at(slug)}/invites/${id}`, { accessToken }),
};
