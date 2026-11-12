import { inWorkspace } from "@/lib/active-workspace";
import { apiClient } from "@/lib/api-client";

/** A machine the workspace enrolled: one its server runs, or one a teammate brought. */
export type TeamMachine = {
	id: string;
	name: string;
	kind: "managed" | "byom";
	status: "pending" | "online" | "offline" | "disabled";
	ownerId: string | null;
	ownerName: string | null;
	/** Whether it is the caller's, and whether the caller may change it. */
	mine: boolean;
	canManage: boolean;
	/** Its address, only for people who may manage it. */
	address: string | null;
	platform: {
		hostname?: string;
		system?: string;
		cpu?: string;
		cores?: number;
		memoryTotalBytes?: number;
		runnerVersion?: string;
		projectsDir?: string;
	};
	lastSeenAt: string | null;
	createdAt: string;
};

export type MachineEnrollment = { code: string; expiresAt: string };

/** What Settings → Machines reads: the inventory, project placements and what the caller may do. */
export type TeamMachines = {
	machines: TeamMachine[];
	/** Project slug → machine id; a project not named runs on the hosted runner's own machine. */
	placements: Record<string, string>;
	canProvision: boolean;
	canPlace: boolean;
	provisionReason: string | null;
};

export type NewMachine = { name: string; kind: "managed" | "byom" };

export const machinesService = {
	list: (accessToken: string) =>
		apiClient.get<TeamMachines>(inWorkspace("/machines"), { accessToken }),
	/** Adds a machine and returns the one-time code its runner joins with. */
	create: (accessToken: string, input: NewMachine) =>
		apiClient.post<{ machine: TeamMachine; enrollment: MachineEnrollment }>(
			inWorkspace("/machines"),
			input,
			{ accessToken },
		),
	/** Replaces its code, for a machine that has not connected or has lost its secret. */
	reissue: (accessToken: string, id: string) =>
		apiClient.post<{ machine: TeamMachine; enrollment: MachineEnrollment }>(
			inWorkspace(`/machines/${encodeURIComponent(id)}/enrollment`),
			undefined,
			{ accessToken },
		),
	rename: (accessToken: string, id: string, name: string) =>
		apiClient.patch<TeamMachine>(
			inWorkspace(`/machines/${encodeURIComponent(id)}`),
			{ name },
			{
				accessToken,
			},
		),
	remove: (accessToken: string, id: string) =>
		apiClient.delete<void>(inWorkspace(`/machines/${encodeURIComponent(id)}`), { accessToken }),
	/** Runs a project on a machine; null puts it back on the hosted runner's own machine. */
	place: (accessToken: string, project: string, machineId: string | null) =>
		apiClient.put<void>(
			inWorkspace(`/machines/placements/${encodeURIComponent(project)}`),
			{ machineId },
			{ accessToken },
		),
};
