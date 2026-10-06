import type { Who } from "../auth";
import type { InboxStore } from "../inbox/store";
import { may, NOT_ALLOWED } from "../permissions";
import { p95, type Probe, type ShipStore, uptime } from "../ship/store";
import { monitorUrl, probeService } from "./probe";
import { type Incident, INTERVAL_MS, type Monitor, type OperateStore, STALE_MS } from "./store";

export type ServiceHealth = {
	id: string;
	name: string;
	url: string;
	state: "healthy" | "degraded" | "down" | "unknown";
	checkedAt: string | null;
	responseMs: number | null;
	uptime: number | null;
	p95: number | null;
	checks: number;
	coverage: number;
	incidentId: string | null;
};
export type OperateOverview = {
	project: string;
	intervalSeconds: number;
	allowed: boolean;
	checkedAt: string | null;
	services: ServiceHealth[];
	incidents: Incident[];
};
export class OperateError extends Error {
	constructor(
		message: string,
		readonly status = 400,
	) {
		super(message);
		this.name = "OperateError";
	}
}
export type OperateDeps = {
	store: OperateStore;
	ship: ShipStore;
	inbox: InboxStore;
	folders: (workspace: string) => Record<string, string>;
	probe?: (url: string) => Promise<Probe>;
	now?: () => Date;
};

/** Read-only observations and incident alerts. Never deploys, reconnects, or rolls back. */
export class Operate {
	private ticking = false;
	constructor(private readonly deps: OperateDeps) {}
	private now(): Date {
		return this.deps.now?.() ?? new Date();
	}
	private linked(workspace: string, project: string): boolean {
		const folders = this.deps.folders(workspace);
		return (
			Object.hasOwn(folders, project) && typeof folders[project] === "string" && !!folders[project]
		);
	}
	private place(workspace: string, project: string): void {
		if (!this.linked(workspace, project))
			throw new OperateError("Project not linked on this machine", 404);
	}
	private inherit(workspace?: string, project?: string): void {
		for (const site of this.deps.ship.configuredSites()) {
			if ((workspace && site.workspace !== workspace) || (project && site.project !== project))
				continue;
			if (!this.linked(site.workspace, site.project)) continue;
			let url: string;
			try {
				url = monitorUrl(site.url).href;
			} catch {
				continue;
			}
			const existing = this.deps.store
				.monitors(site.workspace, site.project)
				.find((item) => item.name === site.name);
			if (
				!existing?.enabled &&
				this.deps.store.monitors().filter((monitor) => monitor.enabled).length >= 50
			)
				continue;
			this.deps.store.register(site.workspace, site.project, site.name, url, true);
		}
	}
	view(who: Who, project: string): OperateOverview {
		this.place(who.workspace, project);
		this.inherit(who.workspace, project);
		const now = this.now();
		const services = this.deps.store
			.monitors(who.workspace, project)
			.filter((item) => item.enabled)
			.map((monitor): ServiceHealth => {
				const probes = this.deps.store.probes(monitor.id, new Date(now.getTime() - 86_400_000));
				const stale =
					monitor.checkedAt === null || now.getTime() - Date.parse(monitor.checkedAt) > STALE_MS;
				const slots = new Set(
					probes.map((probe) => Math.floor(Date.parse(probe.at) / INTERVAL_MS)),
				);
				return {
					id: monitor.id,
					name: monitor.name,
					url: monitor.url,
					state: stale
						? "unknown"
						: monitor.incidentId
							? "down"
							: monitor.ok
								? "healthy"
								: "degraded",
					checkedAt: monitor.checkedAt,
					responseMs: stale ? null : monitor.responseMs,
					uptime: uptime(probes),
					p95: p95(probes),
					checks: probes.length,
					coverage: Math.min(100, (slots.size / 1_440) * 100),
					incidentId: monitor.incidentId,
				};
			});
		return {
			project,
			intervalSeconds: INTERVAL_MS / 1_000,
			allowed: may(who, "production"),
			checkedAt:
				services
					.map((item) => item.checkedAt)
					.filter((at): at is string => at !== null)
					.sort()
					.at(-1) ?? null,
			services,
			incidents: this.deps.store.incidents(who.workspace, project),
		};
	}
	register(who: Who, project: string, name: string, rawUrl: string): void {
		this.place(who.workspace, project);
		if (!may(who, "production")) throw new OperateError(NOT_ALLOWED, 403);
		if (
			!name.trim() ||
			name.length > 80 ||
			Array.from(name).some(
				(char) =>
					char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 || char === "/" || char === "\\",
			)
		)
			throw new OperateError("Give a service name of at most 80 characters");
		let url: string;
		try {
			url = monitorUrl(rawUrl.trim()).href;
		} catch (cause) {
			throw new OperateError(cause instanceof Error ? cause.message : "Bad address");
		}
		const existing = this.deps.store
			.monitors(who.workspace, project)
			.find((item) => item.name === name);
		if (
			!existing?.enabled &&
			this.deps.store.monitors().filter((monitor) => monitor.enabled).length >= 50
		)
			throw new OperateError("This machine supports up to 50 monitors", 409);
		this.deps.store.register(who.workspace, project, name, url);
		this.trimStopped();
	}
	remove(who: Who, project: string, name: string): void {
		this.place(who.workspace, project);
		if (!may(who, "production")) throw new OperateError(NOT_ALLOWED, 403);
		if (!this.deps.store.remove(who.workspace, project, name))
			throw new OperateError("Service not found", 404);
		this.trimStopped();
	}
	private trimStopped(): void {
		this.deps.store.trimStopped(
			new Set(
				this.deps.ship
					.configuredSites()
					.map((site) => JSON.stringify([site.workspace, site.project, site.name])),
			),
		);
	}
	private publish(): void {
		for (const draft of this.deps.store.outbox()) {
			this.deps.inbox.keep(draft);
			this.deps.inbox.trimOperate(draft.workspaceId, draft.project);
			this.deps.store.delivered(draft.id);
		}
	}
	async tick(): Promise<void> {
		if (this.ticking) return;
		this.ticking = true;
		try {
			this.publish();
			this.inherit();
			this.trimStopped();
			const now = this.now();
			const targets = this.deps.store
				.monitors()
				.filter(
					(monitor) =>
						monitor.enabled &&
						this.linked(monitor.workspace, monitor.project) &&
						(!monitor.checkedAt || now.getTime() - Date.parse(monitor.checkedAt) >= INTERVAL_MS),
				);
			let next = 0;
			const worker = async () => {
				for (let index = next++; index < targets.length; index = next++) {
					const monitor = targets[index] as Monitor;
					const result = await (this.deps.probe ?? probeService)(monitor.url);
					// Sample time belongs to this round, so latency cannot defer the next minute.
					const probe = { ...result, at: now.toISOString() };
					if (this.deps.store.record(monitor, probe))
						this.deps.ship.recordProbe(monitor.url, probe);
				}
			};
			await Promise.all(Array.from({ length: Math.min(10, targets.length) }, worker));
			this.publish();
		} finally {
			this.ticking = false;
		}
	}
}
