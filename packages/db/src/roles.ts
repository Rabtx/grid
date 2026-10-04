import type { RolePermission, WorkspaceRole, WorkspaceSettings } from "./schema";

/**
 * What each role may do in a workspace (Settings → Roles). The owner may do everything; the other
 * built-in roles start from these defaults and the workspace changes them; a custom role carries
 * its own. Billing and deleting the workspace are the owner's alone.
 *
 * Keep in step with apps/runner/src/permissions.ts (apps share no code).
 */
export const ROLE_PERMISSIONS: readonly RolePermission[] = [
	"startAgents",
	"approveCommands",
	"mergePulls",
	"production",
	"machines",
	"integrations",
	"invite",
];

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

/** Whether someone with this role (and custom role) may do something in a workspace. */
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
