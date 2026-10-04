export type WorkspaceRole = "owner" | "admin" | "member";

/** A workspace you belong to, with your role in it. */
export interface Workspace {
	id: string;
	slug: string;
	name: string;
	icon: string | null;
	color: string | null;
	/** An uploaded logo (a path on the API), drawn instead of the icon. */
	logoUrl?: string | null;
	/** What applies to everyone in it (Settings → General). */
	settings?: WorkspaceSettings;
	role: WorkspaceRole;
	/** The one requests without a workspace act in. */
	isDefault: boolean;
	createdAt: string;
	updatedAt: string;
}

/** Who may start an agent in a workspace. */
export type AgentAccess = "everyone" | "admins";

/** What applies to everyone in a workspace; a missing field is its default. */
export interface WorkspaceSettings {
	defaultBranch?: string;
	defaultAgent?: string;
	weekStartsOn?: "monday" | "sunday" | "saturday";
	/** Run logs older than this many days are cleared; 0 or missing keeps them. */
	logRetentionDays?: number;
	agentAccess?: Record<string, AgentAccess>;
	agentPolicy?: AgentPolicy;
}

/** What agents may do on their own: per kind of action, and two safety switches. */
export type AgentCapability = "read" | "edit" | "commands" | "packages" | "network" | "push";
export type AgentRule = "allow" | "ask" | "never";
export interface AgentPolicy {
	rules?: Partial<Record<AgentCapability, AgentRule>>;
	newBranch?: boolean;
	showCommands?: boolean;
}

/** Where the workspace's data lives: the database, and its backups. */
export interface DataStatus {
	host: string;
	database: { version: string; sizeBytes: number; healthy: boolean };
	backups: {
		available: boolean;
		hour: number;
		last: { file: string; at: string; sizeBytes: number } | null;
		count: number;
	};
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
	email?: string;
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
