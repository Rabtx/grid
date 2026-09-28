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

/** What an invite link is for, readable before signing in. */
export interface InvitePreview {
	workspace: { slug: string; name: string; icon: string | null; color: string | null };
	role: WorkspaceRole;
	/** Set when the invite was sent to one address; only that account can accept it. */
	email: string | null;
	expiresAt: string;
}

/** Someone in a workspace, as the members list shows them. */
export interface Member {
	userId: string;
	username: string;
	displayName: string | null;
	avatarUrl: string | null;
	role: WorkspaceRole;
	joinedAt: string;
}

/** An invite not yet accepted or expired: for one email, or a link to pass on (email null). */
export interface Invite {
	id: string;
	email: string | null;
	role: Exclude<WorkspaceRole, "owner">;
	expiresAt: string;
	createdAt: string;
}

/** A new invite: its link is in the reply this once and never again. */
export interface CreatedInvite extends Invite {
	token: string;
	url: string;
}

export interface CreateInviteInput {
	email?: string;
	role: Exclude<WorkspaceRole, "owner">;
}
