/**
 * How a runner proves itself to Grid's API: the Grid's own runner key, or the secret of one
 * enrolled machine. Both kinds are handled here so thread sync, board tools and teammate work
 * send the same header.
 */

export type MachineSecret = { id: string; secret: string };

export type RunnerAuth = {
	/** The Grid's runner key; absent on a machine that enrolled with a one-time code. */
	key?: string;
	machine?: MachineSecret;
};

export function authorization(auth: RunnerAuth): string {
	return auth.machine
		? `Machine ${auth.machine.id}.${auth.machine.secret}`
		: `Runner ${auth.key ?? ""}`;
}
