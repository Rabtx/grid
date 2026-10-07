import { runnerCall } from "@/lib/runner-client";

/** This machine as the runner describes it (Settings → Machines). */
export type MachineInfo = {
	hostname: string;
	system: string;
	cpu: string;
	cores: number;
	memory: { totalBytes: number; usedBytes: number };
	cpuPercent: number;
	disk: { totalBytes: number; freeBytes: number };
	runnerVersion: string;
	startedAt: string;
};

/** How this machine's runner behaves. */
export type MachinePrefs = { keepAwake: boolean; concurrency: number; startAtLogin: boolean };

export type MachineStatus = {
	info: MachineInfo;
	prefs: MachinePrefs;
	agentsRunning: number;
	terminals: number;
	projectsDir: string;
};

/** Where an update of Grid itself is up to (Settings → Machines → Grid version). */
export type UpdateRun = {
	state: "running" | "done" | "failed";
	step: string;
	startedAt: string;
	finishedAt: string;
	from: string;
	to: string;
	message: string;
};

export type UpdateStatus = {
	available: boolean;
	reason: string | null;
	current: { commit: string; subject: string } | null;
	behind: number | null;
	last: UpdateRun | null;
};

export const machineService = {
	status: (token: string, scope = "") => runnerCall<MachineStatus>(`${scope}/machine`, token),
	update: (token: string, patch: Partial<MachinePrefs>) =>
		runnerCall<MachinePrefs>("/machine", token, { method: "PATCH", body: JSON.stringify(patch) }),
	addAgent: (token: string, input: { name: string; command: string }) =>
		runnerCall<{ id: string; name: string }>("/agents/acp", token, {
			method: "POST",
			body: JSON.stringify(input),
		}),
	updateStatus: (token: string) => runnerCall<UpdateStatus>("/machine/update", token),
	checkForUpdate: (token: string) =>
		runnerCall<UpdateStatus>("/machine/update/check", token, { method: "POST" }),
	updateGrid: (token: string) =>
		runnerCall<UpdateStatus>("/machine/update", token, { method: "POST" }),
	removeAgent: (token: string, id: string) =>
		runnerCall<void>(`/agents/acp/${encodeURIComponent(id)}`, token, { method: "DELETE" }),
};
