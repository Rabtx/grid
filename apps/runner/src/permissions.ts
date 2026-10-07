import type { RolePermission, Who } from "./auth";

/**
 * What each role may do in a workspace (Settings → Roles): the owner everything, the other
 * built-in roles their defaults as the workspace changed them, a custom role its own.
 *
 * Keep in step with packages/db/src/roles.ts (apps share no code).
 */
const DEFAULTS: Record<"admin" | "member" | "viewer", Record<RolePermission, boolean>> = {
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

/** Whether this person may do something in the workspace they act in. */
export function may(who: Who, permission: RolePermission): boolean {
	// No role is a caller the API did not describe (another Grid driving this one as its
	// environment): it acts with the access its pairing gave it, as before roles had permissions.
	const role = who.role;
	if (!role || role === "owner") return true;
	const custom = who.customRole
		? who.settings?.customRoles?.find((item) => item.id === who.customRole)
		: undefined;
	if (custom) return custom.permissions[permission] === true;
	return who.settings?.rolePermissions?.[role]?.[permission] ?? DEFAULTS[role][permission];
}

/** Owners and admins: what "admins only" means for an agent (Settings → Members). */
export const isAdmin = (who: Who): boolean => who.role === "owner" || who.role === "admin";

/**
 * A shell, or a terminal running an agent's setup, on this runner's machine: whoever may manage
 * the workspace's machines (owners and admins, unless Settings → Roles says otherwise).
 */
export const mayUseTerminals = (who: Who): boolean => may(who, "machines");

/** Viewers follow the work and change nothing. */
export const readOnly = (who: Who): boolean => who.role === "viewer";

/** Why a request was refused, for the person reading it. */
export const NOT_ALLOWED = "Your role in this workspace can't do this";
