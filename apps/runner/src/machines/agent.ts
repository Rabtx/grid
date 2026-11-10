import os from "node:os";

import type { RunnerConfig } from "../config";
import { systemName } from "../machine/info";
import { type MachineIdentity, MachineIdentityStore } from "./identity";

const HEARTBEAT_MS = 30_000;
const RETRY_MS = 60_000;

type Enrolled = {
	machine: { id: string; name: string; workspaceId: string };
	secret: string;
};

/** What the control plane records about this machine, on enrollment and every heartbeat. */
export function platformInfo(projectsDir: string): {
	hostname: string;
	system: string;
	cpu: string;
	cores: number;
	memoryTotalBytes: number;
	projectsDir: string;
} {
	return {
		hostname: os.hostname(),
		system: systemName(process.platform, os.release()),
		cpu: os.cpus()[0]?.model.replace(/\s+/g, " ").trim() ?? "Unknown processor",
		cores: os.cpus().length,
		memoryTotalBytes: os.totalmem(),
		projectsDir,
	};
}

/**
 * The address the hosted runner reaches this one at. An explicit `GRID_MACHINE_ADDRESS` wins; a
 * runner bound to one address advertises it; a wildcard bind picks the machine's tailnet address
 * first, then a private LAN one, so a BYOM laptop joins over the same tailnet the installer set up.
 */
export function advertisedAddress(config: RunnerConfig): string {
	if (config.machineAddress) return config.machineAddress.replace(/\/$/, "");
	const host = config.host;
	const wildcard = host === "0.0.0.0" || host === "::" || host === "";
	if (!wildcard && host !== "127.0.0.1" && host !== "localhost" && host !== "::1")
		return `http://${bracket(host)}:${config.port}`;
	const candidates = Object.values(os.networkInterfaces())
		.flat()
		.filter((item): item is os.NetworkInterfaceInfo => item !== undefined)
		.filter((item) => !item.internal && item.family === "IPv4")
		.map((item) => item.address);
	const chosen =
		candidates.find((address) => address.startsWith("100.")) ??
		candidates.find((address) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address)) ??
		"127.0.0.1";
	return `http://${chosen}:${config.port}`;
}

function bracket(host: string): string {
	return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

/**
 * This runner as a team machine: enrolls with a one-time code the first time, then keeps saying it
 * is alive. The secret stays here; the control plane keeps only its hash. Enrollment failure is
 * not fatal — the runner still serves local work and retries in the background.
 */
export class MachineAgent {
	private identity: MachineIdentity | null;
	private timer: ReturnType<typeof setInterval> | null = null;
	private retry: ReturnType<typeof setTimeout> | null = null;
	private stopped = false;
	private warned = false;
	readonly store: MachineIdentityStore;

	constructor(
		chatDb: string,
		private readonly config: RunnerConfig,
		private readonly fetcher: typeof fetch = fetch,
	) {
		this.store = new MachineIdentityStore(chatDb);
		this.identity = this.store.get();
	}

	/** Enroll when needed, then start heartbeats. Called once, before thread sync is set up. */
	async connect(): Promise<MachineIdentity | null> {
		this.identity ??= this.store.get();
		if (!this.identity && this.config.enrollmentCode) await this.tryEnroll();
		if (this.identity) this.startHeartbeat();
		return this.identity;
	}

	/** The credential thread sync and board tools send to the API; null before enrollment. */
	token(): { id: string; secret: string } | null {
		return this.identity ? { id: this.identity.machineId, secret: this.identity.secret } : null;
	}

	machine(): { id: string; name: string } | null {
		return this.identity ? { id: this.identity.machineId, name: this.identity.name } : null;
	}

	workspaceId(): string | null {
		return this.identity?.workspaceId ?? null;
	}

	stop(): void {
		this.stopped = true;
		if (this.timer) clearInterval(this.timer);
		if (this.retry) clearTimeout(this.retry);
		this.timer = null;
		this.retry = null;
	}

	private startHeartbeat(): void {
		if (this.timer || this.stopped) return;
		void this.beat();
		this.timer = setInterval(() => void this.beat(), HEARTBEAT_MS);
		this.timer.unref?.();
	}

	private scheduleRetry(): void {
		if (this.retry || this.stopped) return;
		this.retry = setTimeout(() => {
			this.retry = null;
			if (!this.identity && this.config.enrollmentCode) void this.tryEnroll();
			else void this.beat();
		}, RETRY_MS);
		this.retry.unref?.();
	}

	private async tryEnroll(): Promise<void> {
		try {
			const address = advertisedAddress(this.config);
			const response = await this.fetcher(`${this.config.apiUrl}/api/v1/runner/machines/enroll`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					code: this.config.enrollmentCode,
					name: this.config.machineName ?? os.hostname(),
					address,
					platform: platformInfo(this.config.projectsDir),
				}),
				signal: AbortSignal.timeout(10_000),
			});
			const payload = (await response.json().catch(() => null)) as {
				data?: Enrolled;
				message?: string;
			} | null;
			if (!response.ok || !payload?.data)
				throw new Error(payload?.message ?? `the API answered ${response.status}`);
			this.identity = {
				machineId: payload.data.machine.id,
				workspaceId: payload.data.machine.workspaceId,
				name: payload.data.machine.name,
				secret: payload.data.secret,
				address,
				enrolledAt: new Date().toISOString(),
			};
			this.store.save(this.identity);
			this.warned = false;
			console.log(`[runner] enrolled as machine ${this.identity.machineId}`);
			this.startHeartbeat();
		} catch (cause) {
			if (!this.warned) {
				console.warn(
					`[runner] could not join the team as a machine: ${
						cause instanceof Error ? cause.message : String(cause)
					}`,
				);
				this.warned = true;
			}
			this.scheduleRetry();
		}
	}

	private async beat(): Promise<void> {
		const identity = this.identity;
		if (!identity || this.stopped) return;
		try {
			const response = await this.fetcher(
				`${this.config.apiUrl}/api/v1/runner/machines/heartbeat`,
				{
					method: "POST",
					headers: {
						authorization: `Machine ${identity.machineId}.${identity.secret}`,
						"content-type": "application/json",
					},
					body: JSON.stringify({
						address: advertisedAddress(this.config),
						platform: platformInfo(this.config.projectsDir),
					}),
					signal: AbortSignal.timeout(10_000),
				},
			);
			if (!response.ok) throw new Error(`the API answered ${response.status}`);
			this.warned = false;
		} catch (cause) {
			if (!this.warned) {
				console.warn(
					`[runner] heartbeat paused: ${cause instanceof Error ? cause.message : String(cause)}`,
				);
				this.warned = true;
			}
			this.scheduleRetry();
		}
	}
}
