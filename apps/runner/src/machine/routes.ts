import type { Who } from "../auth";
import { may } from "../permissions";
import { type AcpAgentStore, agentId, splitCommand } from "../agents/acp-agents";
import { machineInfo } from "./info";
import type { GridUpdater } from "./update";
import {
	CONCURRENCY_CHOICES,
	type MachinePrefs,
	type MachinePrefsStore,
	setStartAtLogin,
	startsAtLogin,
} from "./prefs";

/** What the machine and agent routes need from the rest of the runner. */
export type MachineDeps = {
	prefs: MachinePrefsStore;
	acpAgents: AcpAgentStore;
	projectsDir: string;
	startedAt: number;
	/** How many agents are working and terminals are open. */
	counts: () => { agents: number; terminals: number };
	/** A change to the runner's behaviour, applied at once. */
	apply: (prefs: MachinePrefs) => void;
	/** Drive a new ACP agent, or stop offering a removed one. */
	addAgent: (agent: { id: string; name: string; command: string[] }) => void;
	removeAgent: (id: string) => void;
	/** Whether an id is already an agent (built in or added). */
	knownAgent: (id: string) => boolean;
	/** Updating Grid itself and restarting it (Settings → Machines). */
	updater?: GridUpdater;
};

function failure(status: number, message: string): Response {
	return Response.json({ message }, { status });
}

/** People who may change the machine: whoever's role may manage machines (Settings → Roles). */
function mayManage(who: Who): boolean {
	return may(who, "machines");
}

/**
 * `GET`/`PATCH /machine`: this machine (what it is, how busy, its runner settings); `POST
 * /agents/acp` and `DELETE /agents/acp/:id`: ACP agents added from Settings. Null for paths it
 * does not own.
 */
export async function machineRequest(
	request: Request,
	url: URL,
	who: Who,
	deps: MachineDeps,
): Promise<Response | null> {
	if (url.pathname === "/machine") {
		if (request.method === "GET") {
			const counts = deps.counts();
			return Response.json({
				data: {
					info: await machineInfo(deps.projectsDir, deps.startedAt),
					prefs: { ...deps.prefs.get(), startAtLogin: startsAtLogin() },
					agentsRunning: counts.agents,
					terminals: counts.terminals,
					projectsDir: deps.projectsDir,
				},
			});
		}
		if (request.method !== "PATCH") return failure(405, "Use GET or PATCH");
		if (!mayManage(who)) return failure(403, "Only admins can change this machine");
		const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
		if (!body || typeof body !== "object") return failure(400, "Send the settings to change");
		const next = { ...deps.prefs.get() };
		if (body.keepAwake !== undefined) {
			if (typeof body.keepAwake !== "boolean") return failure(400, "Keep awake is on or off");
			next.keepAwake = body.keepAwake;
		}
		if (body.concurrency !== undefined) {
			if (!CONCURRENCY_CHOICES.includes(body.concurrency as 1 | 2 | 4))
				return failure(400, "Choose 1, 2 or 4 agents at the same time");
			next.concurrency = body.concurrency as number;
		}
		if (body.startAtLogin !== undefined) {
			if (typeof body.startAtLogin !== "boolean")
				return failure(400, "Start at login is on or off");
			if (!setStartAtLogin(body.startAtLogin))
				return failure(400, "This system has no way for Grid to start at login");
		}
		const saved = deps.prefs.set(next);
		deps.apply(saved);
		return Response.json({ data: { ...saved, startAtLogin: startsAtLogin() } });
	}

	// Grid's own version: which commit it runs, whether main is ahead, and updating to it.
	if (url.pathname === "/machine/update" || url.pathname === "/machine/update/check") {
		const updater = deps.updater;
		if (!updater) return failure(404, "This runner cannot update itself");
		if (request.method === "GET" && url.pathname === "/machine/update")
			return Response.json({ data: updater.status() });
		if (request.method !== "POST") return failure(405, "Use GET or POST");
		if (!mayManage(who)) return failure(403, "Only admins can update Grid");
		if (url.pathname === "/machine/update/check") return Response.json({ data: updater.check() });
		try {
			if (!updater.start()) return failure(409, "An update is already running");
		} catch (cause) {
			return failure(
				400,
				cause instanceof Error ? cause.message : "Grid cannot update itself here",
			);
		}
		return Response.json({ data: updater.status() }, { status: 202 });
	}

	if (url.pathname === "/agents/acp" && request.method === "POST") {
		if (!mayManage(who)) return failure(403, "Only admins can add agents");
		const body = (await request.json().catch(() => null)) as {
			name?: unknown;
			command?: unknown;
		} | null;
		const name = typeof body?.name === "string" ? body.name.trim() : "";
		const command = typeof body?.command === "string" ? splitCommand(body.command.trim()) : [];
		if (!name || name.length > 60) return failure(400, "Give the agent a name");
		if (!command.length || command.join(" ").length > 500)
			return failure(400, "Give the command that starts it, such as gemini --experimental-acp");
		const id = agentId(name);
		if (!id) return failure(400, "Give the agent a name with letters or numbers");
		if (deps.knownAgent(id)) return failure(409, `There is already an agent called ${name}`);
		const agent = deps.acpAgents.add({ id, name, command });
		deps.addAgent(agent);
		return Response.json({ data: agent }, { status: 201 });
	}

	const removing = url.pathname.match(/^\/agents\/acp\/([\w-]+)$/);
	if (removing && request.method === "DELETE") {
		if (!mayManage(who)) return failure(403, "Only admins can remove agents");
		const id = removing[1] ?? "";
		if (!deps.acpAgents.remove(id)) return failure(404, "That agent was not added here");
		deps.removeAgent(id);
		return new Response(null, { status: 204 });
	}
	return null;
}
