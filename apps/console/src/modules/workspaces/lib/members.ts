import { now as clockNow } from "@/lib/clock";

import type {
	Member,
	RoleInput,
	RolePermission,
	WorkspaceRole,
	WorkspaceSettings,
} from "../types/workspace.types";

/**
 * Who may do what with a workspace's people, as the API decides it: owners run billing, the slug
 * and deleting; admins run settings and members; members do the work; viewers follow it. What
 * each role may do beyond that is the workspace's (Settings → Roles). The screen only offers what
 * the API would accept, so nobody meets a refusal for a button they should not have seen.
 */
const RANK: Record<WorkspaceRole, number> = { viewer: -1, member: 0, admin: 1, owner: 2 };

export const ROLES: readonly WorkspaceRole[] = ["owner", "admin", "member", "viewer"];

export const ROLE_LABEL: Record<WorkspaceRole, string> = {
	owner: "Owner",
	admin: "Admin",
	member: "Member",
	viewer: "Viewer",
};

export const ROLE_HINT: Record<WorkspaceRole, string> = {
	owner: "Everything, including billing and deleting the workspace",
	admin: "Manage people, machines and integrations",
	member: "Work in projects and start the agents allowed for members",
	viewer: "Follow tasks, notes and runs. Can't change anything",
};

/** What a role may do, in the order Settings → Roles lists it. */
export const PERMISSIONS: readonly { id: RolePermission; label: string }[] = [
	{ id: "startAgents", label: "Start agents" },
	{ id: "approveCommands", label: "Approve agent commands" },
	{ id: "mergePulls", label: "Merge pull requests" },
	{ id: "production", label: "Run on production" },
	{ id: "machines", label: "Manage machines" },
	{ id: "integrations", label: "Manage integrations" },
	{ id: "invite", label: "Invite people" },
];

/** Each built-in role's permissions until the workspace changes them (the API's defaults). */
export const ROLE_DEFAULTS: Record<
	Exclude<WorkspaceRole, "owner">,
	Record<RolePermission, boolean>
> = {
	admin: {
		startAgents: true,
		approveCommands: true,
		mergePulls: true,
		production: true,
		machines: true,
		integrations: true,
		invite: true,
	},
	member: {
		startAgents: true,
		approveCommands: true,
		mergePulls: true,
		production: false,
		machines: false,
		integrations: false,
		invite: false,
	},
	viewer: {
		startAgents: false,
		approveCommands: false,
		mergePulls: false,
		production: false,
		machines: false,
		integrations: false,
		invite: false,
	},
};

/** Whether someone with this role (and custom role) may do something in the workspace. */
export function mayDo(
	permission: RolePermission,
	role: WorkspaceRole,
	customRole: string | null | undefined,
	settings: WorkspaceSettings | null | undefined,
): boolean {
	if (role === "owner") return true;
	const custom = customRole ? settings?.customRoles?.find((item) => item.id === customRole) : null;
	if (custom) return custom.permissions[permission] === true;
	return settings?.rolePermissions?.[role]?.[permission] ?? ROLE_DEFAULTS[role][permission];
}

/** Owners and admins: they run settings and people. */
export const isAdmin = (role: WorkspaceRole | undefined): boolean =>
	role === "owner" || role === "admin";

/** At least as senior: an admin can act on admins and below, an owner on everyone. */
export function outranks(a: WorkspaceRole, b: WorkspaceRole): boolean {
	return RANK[a] >= RANK[b];
}

/** Change someone else's role or remove them: an admin or owner acting on someone not senior. */
export function canManage(me: WorkspaceRole, member: Member, myId: string | null): boolean {
	return member.userId !== myId && isAdmin(me) && outranks(me, member.role);
}

/** The roles you can give someone: yours and below. */
export function rolesYouCanGive(me: WorkspaceRole): WorkspaceRole[] {
	return ROLES.filter((role) => outranks(me, role));
}

/** A role as a picker holds it: a built-in role, or a custom one by its id. */
export type RoleChoice = WorkspaceRole | `custom:${string}`;

/** Someone's role as a picker value. */
export function choiceOf(holder: { role: WorkspaceRole; customRole?: string | null }): RoleChoice {
	return holder.customRole ? `custom:${holder.customRole}` : holder.role;
}

/** A picker value as the API takes it: a custom role ranks as a member. */
export function roleInput(choice: RoleChoice): RoleInput {
	return choice.startsWith("custom:")
		? { role: "member", customRole: choice.slice("custom:".length) }
		: { role: choice as WorkspaceRole, customRole: null };
}

/** The roles you may give, built-in and the workspace's own, for a picker. */
export function roleChoices(
	me: WorkspaceRole,
	settings: WorkspaceSettings | null | undefined,
	options: { owner?: boolean } = {},
): { value: RoleChoice; label: string; description?: string }[] {
	const builtIn = rolesYouCanGive(me)
		.filter((role) => options.owner !== false || role !== "owner")
		.map((role) => ({
			value: role as RoleChoice,
			label: ROLE_LABEL[role],
			description: ROLE_HINT[role],
		}));
	const custom = outranks(me, "member")
		? (settings?.customRoles ?? []).map((role) => ({
				value: `custom:${role.id}` as RoleChoice,
				label: role.name,
				description: role.description,
			}))
		: [];
	return [...builtIn, ...custom];
}

/** Someone's role by name: their custom role's, else the built-in one's. */
export function roleName(
	holder: { role: WorkspaceRole; customRole?: string | null },
	settings: WorkspaceSettings | null | undefined,
): string {
	const custom = holder.customRole
		? settings?.customRoles?.find((role) => role.id === holder.customRole)
		: null;
	return custom?.name ?? ROLE_LABEL[holder.role];
}

/** A member's name as people know it: the display name, else the username. */
export function memberName(member: Member): string {
	return member.displayName?.trim() || member.username;
}

/** How long an invite has left: "expires in 5 d", "expires in 3 h", "expires soon". */
export function expiresIn(at: string, now: number = clockNow()): string {
	const hours = (Date.parse(at) - now) / 3_600_000;
	if (hours <= 1) return "expires soon";
	if (hours < 48) return `expires in ${Math.round(hours)} h`;
	return `expires in ${Math.round(hours / 24)} d`;
}
