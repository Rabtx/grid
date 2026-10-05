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

export const machineService = {
	status: (token: string, scope = "") => runnerCall<MachineStatus>(`${scope}/machine`, token),
	update: (token: string, patch: Partial<MachinePrefs>) =>
		runnerCall<MachinePrefs>("/machine", token, { method: "PATCH", body: JSON.stringify(patch) }),
	addAgent: (token: string, input: { name: string; command: string }) =>
		runnerCall<{ id: string; name: string }>("/agents/acp", token, {
			method: "POST",
			body: JSON.stringify(input),
		}),
	removeAgent: (token: string, id: string) =>
		runnerCall<void>(`/agents/acp/${encodeURIComponent(id)}`, token, { method: "DELETE" }),
};
