import { apiClient, getApiOrigin } from "@/lib/api-client";

import type {
	CreatedInvite,
	CreateInviteInput,
	CreateWorkspaceInput,
	DataStatus,
	Invite,
	InvitePreview,
	Member,
	Workspace,
	WorkspaceRole,
	WorkspaceSettings,
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
	/** Send an emailed invite again, with a fresh link. */
	resendInvite: (accessToken: string, slug: string, id: string) =>
		apiClient.post<CreatedInvite>(`${at(slug)}/invites/${id}/resend`, undefined, { accessToken }),
	update: (
		accessToken: string,
		slug: string,
		patch: { name?: string; settings?: Partial<WorkspaceSettings> },
	) => apiClient.patch<Workspace>(at(slug), patch, { accessToken }),
	uploadLogo: (accessToken: string, slug: string, file: File) => {
		const form = new FormData();
		form.append("file", file);
		return apiClient.upload<Workspace>(`${at(slug)}/logo`, form, { accessToken });
	},
	data: (accessToken: string, slug: string) =>
		apiClient.get<DataStatus>(`${at(slug)}/data`, { accessToken }),
	backUp: (accessToken: string, slug: string) =>
		apiClient.post<{ file: string; at: string; sizeBytes: number }>(
			`${at(slug)}/backups`,
			undefined,
			{ accessToken },
		),
	remove: (accessToken: string, slug: string) => apiClient.delete<void>(at(slug), { accessToken }),
	/** The workspace as one JSON file, saved by the browser. */
	async exportFile(accessToken: string, slug: string): Promise<void> {
		const response = await fetch(`${getApiOrigin()}/api/v1${at(slug)}/export`, {
			headers: { Authorization: `Bearer ${accessToken}` },
		});
		if (!response.ok) throw new Error("The export did not come back");
		const name =
			/filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ??
			`grid-${slug}.json`;
		const link = document.createElement("a");
		link.href = URL.createObjectURL(await response.blob());
		link.download = name;
		link.click();
		URL.revokeObjectURL(link.href);
	},
};
