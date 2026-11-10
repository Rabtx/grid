import { createSignal, untrack } from "solid-js";

import { localStore } from "@/lib/local-store";

import {
	type MachineEnrollment,
	type NewMachine,
	type TeamMachine,
	type TeamMachines,
	machinesService,
} from "../services/machines.service";

/**
 * The workspace's machines and where its projects run, read once per visit. One list for the
 * whole console: Settings → Machines, the picker and the terminal's "open on…" agree on it.
 */
const [overview, setOverview] = createSignal<TeamMachines | null>(null);
const [error, setError] = createSignal<string | null>(null);
let loading: Promise<void> | null = null;
let sequence = 0;
localStore.onUserChange(() => {
	setOverview(null);
	setError(null);
	loading = null;
	sequence++;
});

export const machinesStore = {
	overview,
	machines: (): TeamMachine[] => overview()?.machines ?? [],
	placements: (): Record<string, string> => overview()?.placements ?? {},
	error,
	canProvision: () => overview()?.canProvision ?? false,
	canPlace: () => overview()?.canPlace ?? false,
	provisionReason: () => overview()?.provisionReason ?? null,
	/** A machine by id, or null. */
	byId: (id: string | null | undefined): TeamMachine | null =>
		id ? (overview()?.machines.find((machine) => machine.id === id) ?? null) : null,
	labelOf: (id: string | null | undefined): string | null => machinesStore.byId(id)?.name ?? null,

	/** Read the list, sharing the request between callers. */
	load(token: string): Promise<void> {
		if (loading) return loading;
		const started = localStore.version();
		const request = ++sequence;
		const current = () => started === localStore.version() && request === sequence;
		loading = (async () => {
			try {
				const next = await machinesService.list(token);
				if (!current()) return;
				setOverview(next);
				setError(null);
			} catch (cause) {
				if (!current()) return;
				setError(cause instanceof Error ? cause.message : "Could not load the machines");
				// Let a later read try again rather than keeping the failure for the visit.
				loading = null;
			}
		})();
		return loading;
	},
	reload(token: string): Promise<void> {
		loading = null;
		return machinesStore.load(token);
	},

	async create(token: string, input: NewMachine): Promise<MachineEnrollment> {
		const started = localStore.version();
		const added = await machinesService.create(token, input);
		if (started === localStore.version()) {
			setOverview((current) =>
				current ? { ...current, machines: [...current.machines, added.machine] } : current,
			);
			sequence++;
			loading = null;
		}
		return added.enrollment;
	},
	async reissue(token: string, id: string): Promise<MachineEnrollment> {
		const result = await machinesService.reissue(token, id);
		const started = localStore.version();
		if (started === localStore.version()) {
			setOverview((current) =>
				current
					? {
							...current,
							machines: current.machines.map((machine) =>
								machine.id === id ? result.machine : machine,
							),
						}
					: current,
			);
		}
		return result.enrollment;
	},
	async rename(token: string, id: string, name: string): Promise<void> {
		const updated = await machinesService.rename(token, id, name);
		const started = localStore.version();
		if (started !== localStore.version()) return;
		setOverview((current) =>
			current
				? {
						...current,
						machines: current.machines.map((machine) => (machine.id === id ? updated : machine)),
					}
				: current,
		);
	},
	async remove(token: string, id: string): Promise<void> {
		await machinesService.remove(token, id);
		const started = localStore.version();
		if (started !== localStore.version()) return;
		setOverview((current) => {
			if (!current) return current;
			const placements = Object.fromEntries(
				Object.entries(current.placements).filter(([, machineId]) => machineId !== id),
			);
			return {
				...current,
				machines: current.machines.filter((machine) => machine.id !== id),
				placements,
			};
		});
	},
	/** Runs a project on a machine, or (null) on the hosted runner's own machine. */
	async place(token: string, project: string, machineId: string | null): Promise<void> {
		await machinesService.place(token, project, machineId);
		const started = localStore.version();
		if (started !== localStore.version()) return;
		setOverview((current) => {
			if (!current) return current;
			const placements = { ...current.placements };
			if (machineId) placements[project] = machineId;
			else delete placements[project];
			return { ...current, placements };
		});
	},
	/** Only for `placementsStore`, which owns the merged project → placement map. */
	setLoaded(next: TeamMachines | null): void {
		if (next) setOverview(next);
	},
	loaded: (): boolean => untrack(overview) !== null,
};
