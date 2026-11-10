/** How long the machine list is trusted before asking the control plane again. */
const TTL_MS = 10_000;
/** After a miss, ask again soon rather than waiting a full window; a newly started machine is coming. */
const MISS_TTL_MS = 1_000;

export type FleetEntry = {
	id: string;
	workspaceId: string;
	name: string;
	address: string;
	kind: "managed" | "byom";
	status: "pending" | "online" | "offline" | "disabled";
};

/**
 * The machines this Grid knows, as the hosted runner needs them to carry console calls: an
 * address per machine in a workspace. Read with the Grid's runner key and kept briefly; the
 * console sends the person's own token on, which the machine checks against the same API.
 */
export class MachineFleet {
	private entries: FleetEntry[] = [];
	private fetchedAt = 0;
	private pending: Promise<void> | null = null;

	constructor(
		private readonly api: { url: string; key: string },
		private readonly fetcher: typeof fetch = fetch,
	) {}

	/** The address of one machine, when it is in this workspace; null when it is not. */
	async address(workspaceId: string, machineId: string): Promise<string | null> {
		await this.load();
		const found = this.entries.find(
			(entry) => entry.id === machineId && entry.workspaceId === workspaceId,
		);
		if (found) return found.address;
		// A machine made a moment ago may not have been in the last read.
		await this.load(true);
		return (
			this.entries.find((entry) => entry.id === machineId && entry.workspaceId === workspaceId)
				?.address ?? null
		);
	}

	private async load(force = false): Promise<void> {
		const age = Date.now() - this.fetchedAt;
		if (!force && this.fetchedAt > 0 && age < TTL_MS) return;
		if (this.pending) return this.pending;
		this.pending = (async () => {
			try {
				const response = await this.fetcher(`${this.api.url}/api/v1/runner/fleet`, {
					headers: { authorization: `Runner ${this.api.key}` },
				});
				if (!response.ok) throw new Error(`the API answered ${response.status}`);
				const payload = (await response.json().catch(() => null)) as {
					data?: FleetEntry[];
				} | null;
				if (Array.isArray(payload?.data)) {
					this.entries = payload.data;
					this.fetchedAt = Date.now();
				}
			} catch {
				// Keep what was known: a machine that answered a moment ago usually still does. Retry
				// soon rather than pausing relay traffic for the full window.
				this.fetchedAt = Date.now() - TTL_MS + MISS_TTL_MS;
			} finally {
				this.pending = null;
			}
		})();
		return this.pending;
	}
}
