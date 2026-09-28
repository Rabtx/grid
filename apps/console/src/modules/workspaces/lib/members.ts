import type { Member, WorkspaceRole } from "../types/workspace.types";

/**
 * Who may do what with a workspace's people, as the API decides it: owners run billing, the slug
 * and deleting; admins run settings and members; members do the work. The screen only offers what
 * the API would accept, so nobody meets a refusal for a button they should not have seen.
 */
const RANK: Record<WorkspaceRole, number> = { member: 0, admin: 1, owner: 2 };

export const ROLES: readonly WorkspaceRole[] = ["owner", "admin", "member"];

export const ROLE_LABEL: Record<WorkspaceRole, string> = {
	owner: "Owner",
	admin: "Admin",
	member: "Member",
};

export const ROLE_HINT: Record<WorkspaceRole, string> = {
	owner: "Everything, including billing, the workspace address and deleting it.",
	admin: "Settings, members and invites, as well as the work.",
	member: "Projects, threads, the board and the rest of the work.",
};

/** At least as senior: an admin can act on admins and members, an owner on everyone. */
export function outranks(a: WorkspaceRole, b: WorkspaceRole): boolean {
	return RANK[a] >= RANK[b];
}

/** Owners and admins invite people and see the pending invites. */
export function canInvite(me: WorkspaceRole): boolean {
	return RANK[me] >= RANK.admin;
}

/** Change someone else's role or remove them: an admin or owner acting on someone not senior. */
export function canManage(me: WorkspaceRole, member: Member, myId: string | null): boolean {
	return member.userId !== myId && canInvite(me) && outranks(me, member.role);
}

/** The roles you can give someone: yours and below. */
export function rolesYouCanGive(me: WorkspaceRole): WorkspaceRole[] {
	return ROLES.filter((role) => outranks(me, role));
}

/** A member's name as people know it: the display name, else the username. */
export function memberName(member: Member): string {
	return member.displayName?.trim() || member.username;
}

/** How long an invite has left: "expires in 5 d", "expires in 3 h", "expires soon". */
export function expiresIn(at: string, now: number = Date.now()): string {
	const hours = (Date.parse(at) - now) / 3_600_000;
	if (hours <= 1) return "expires soon";
	if (hours < 48) return `expires in ${Math.round(hours)} h`;
	return `expires in ${Math.round(hours / 24)} d`;
}
