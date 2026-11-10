/**
 * Where a project runs, as placements keep it: an environment this Grid paired (`<id>`) or one of
 * the workspace's enrolled machines (`machine:<id>`). Both reach the runner through this console,
 * but a machine is carried by the hosted runner under `/machines/<id>`.
 */

export const MACHINE_PREFIX = "machine:";

export function machinePlacement(id: string): string {
	return `${MACHINE_PREFIX}${id}`;
}

export function isMachinePlacement(value: string): boolean {
	return value.startsWith(MACHINE_PREFIX);
}

export function machinePlacementId(value: string): string {
	return value.slice(MACHINE_PREFIX.length);
}

/** The runner path prefix for a placement; empty for this machine. */
export function scopeForPlacement(value: string | null | undefined): string {
	if (!value) return "";
	const prefix = isMachinePlacement(value) ? "machines" : "env";
	const id = isMachinePlacement(value) ? machinePlacementId(value) : value;
	return `/${prefix}/${encodeURIComponent(id)}`;
}
