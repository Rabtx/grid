import type { Who } from "../auth";
import type { ChatStore } from "../chat/store";
import { may, NOT_ALLOWED } from "../permissions";
import { type LogTail, logPath, readLogTail } from "./log-tail";
import { OperateError } from "./service";
import type { HostingCharge, LogSource, TelemetryStore } from "./telemetry-store";

export type LogsOverview = { project: string; allowed: boolean; sources: LogSource[] };
export type CostsOverview = {
	project: string;
	allowed: boolean;
	currency: "USD";
	agents: {
		costUsd: number | null;
		reportedSessions: number;
		totalSessions: number;
		providers: ReturnType<ChatStore["projectCosts"]>;
	};
	hosting: { totalCents: number | null; charges: HostingCharge[] };
};
export type TelemetryDeps = {
	store: TelemetryStore;
	chat: Pick<ChatStore, "projectCosts">;
	folders: (workspace: string) => Record<string, string>;
};
export function telemetryName(value: string): string {
	if (
		!value.trim() ||
		value.length > 80 ||
		Array.from(value).some(
			(char) =>
				char.charCodeAt(0) < 32 ||
				(char.charCodeAt(0) >= 127 && char.charCodeAt(0) <= 159) ||
				char === "/" ||
				char === "\\",
		)
	)
		throw new OperateError("Give a name of 1–80 characters");
	return value.trim();
}
export class OperateTelemetry {
	constructor(private readonly deps: TelemetryDeps) {}
	private folder(who: Who, project: string, production = false): string {
		const folders = this.deps.folders(who.workspace);
		const folder = Object.hasOwn(folders, project) ? folders[project] : undefined;
		if (typeof folder !== "string" || !folder)
			throw new OperateError("Project not linked on this machine", 404);
		if (production && !may(who, "production")) throw new OperateError(NOT_ALLOWED, 403);
		return folder;
	}
	logs(who: Who, project: string): LogsOverview {
		this.folder(who, project, true);
		return { project, allowed: true, sources: this.deps.store.sources(who.workspace, project) };
	}
	register(who: Who, project: string, name: string, path: string): void {
		const folder = this.folder(who, project, true);
		name = telemetryName(name);
		path = logPath(path);
		// Validate the actual opened file before accepting metadata, including nonblocking FIFO refusal.
		readLogTail(folder, path);
		this.deps.store.register(who.workspace, project, name, path);
	}
	tail(who: Who, project: string, name: string): LogSource & LogTail {
		const folder = this.folder(who, project, true);
		const source = this.deps.store
			.sources(who.workspace, project)
			.find((item) => item.name === telemetryName(name));
		if (!source) throw new OperateError("Log source not found", 404);
		return { ...source, ...readLogTail(folder, source.path) };
	}
	removeSource(who: Who, project: string, name: string): void {
		this.folder(who, project, true);
		if (!this.deps.store.removeSource(who.workspace, project, telemetryName(name)))
			throw new OperateError("Log source not found", 404);
	}
	costs(who: Who, project: string): CostsOverview {
		this.folder(who, project);
		const providers = this.deps.chat.projectCosts(who.workspace, project);
		const reportedSessions = providers.reduce((sum, item) => sum + item.reportedSessions, 0);
		const costUsd = reportedSessions
			? providers.reduce((sum, item) => sum + (item.costUsd ?? 0), 0)
			: null;
		if (costUsd !== null && !Number.isFinite(costUsd))
			throw new OperateError("Reported costs exceed the supported total", 409);
		const charges = this.deps.store.charges(who.workspace, project);
		return {
			project,
			allowed: may(who, "production"),
			currency: "USD" as const,
			agents: {
				costUsd,
				reportedSessions,
				totalSessions: providers.reduce((sum, item) => sum + item.totalSessions, 0),
				providers,
			},
			hosting: {
				totalCents: charges.length
					? charges.reduce((sum, item) => sum + item.amountCents, 0)
					: null,
				charges,
			},
		};
	}
	addCharge(who: Who, project: string, input: unknown): HostingCharge {
		this.folder(who, project, true);
		if (
			typeof input !== "object" ||
			input === null ||
			!("service" in input) ||
			!("provider" in input) ||
			!("amountCents" in input) ||
			!("date" in input) ||
			typeof input.service !== "string" ||
			typeof input.provider !== "string" ||
			typeof input.amountCents !== "number" ||
			typeof input.date !== "string"
		)
			throw new OperateError("Give a service, provider, USD cents and date");
		const service = telemetryName(input.service),
			provider = telemetryName(input.provider);
		if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 0)
			throw new OperateError("Give non-negative whole USD cents");
		if (
			!/^\d{4}-\d{2}-\d{2}$/.test(input.date) ||
			!Number.isFinite(Date.parse(input.date)) ||
			new Date(input.date).toISOString().slice(0, 10) !== input.date
		)
			throw new OperateError("Give a valid date as YYYY-MM-DD");
		const charge = {
			id: crypto.randomUUID(),
			service,
			provider,
			amountCents: input.amountCents,
			date: input.date,
			createdAt: new Date().toISOString(),
		};
		this.deps.store.addCharge(who.workspace, project, charge);
		return charge;
	}
	removeCharge(who: Who, project: string, id: string): void {
		this.folder(who, project, true);
		if (!this.deps.store.removeCharge(who.workspace, project, id))
			throw new OperateError("Hosting charge not found", 404);
	}
}
