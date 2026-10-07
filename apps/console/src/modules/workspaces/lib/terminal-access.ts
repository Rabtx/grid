import { useWorkspaces } from "../context/workspaces-context";
import { mayDo } from "./members";

/**
 * Whether you may open a shell on this workspace's machines: the runner allows it to roles that
 * manage machines (owners and admins, unless Settings → Roles says otherwise). Without it, terminal
 * buttons are left out rather than failing when pressed.
 */
export function useTerminalAccess(): () => boolean {
	const workspaces = useWorkspaces();
	return () => {
		const current = workspaces.current();
		return current ? mayDo("machines", current.role, current.customRole, current.settings) : false;
	};
}

/** Why there is no terminal, for the places that would otherwise show one. */
export const TERMINALS_NOT_ALLOWED =
	"Terminals on this machine are for roles that manage machines. Ask an owner or admin.";
