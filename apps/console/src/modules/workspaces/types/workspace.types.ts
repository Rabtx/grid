export type WorkspaceRole = "owner" | "admin" | "member";

/** A workspace you belong to, with your role in it. */
export interface Workspace {
	id: string;
	slug: string;
	name: string;
	icon: string | null;
	color: string | null;
	role: WorkspaceRole;
	/** The one requests without a workspace act in. */
	isDefault: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface CreateWorkspaceInput {
	name: string;
	slug: string;
}
