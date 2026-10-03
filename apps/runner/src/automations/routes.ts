import type { Who } from "../auth";
import type { ChatHub } from "../chat/hub";
import { AutomationError, type Automations } from "./service";
import { validTriggers } from "./schedule";
import {
	type Automation,
	type AutomationInput,
	type AutomationOptions,
	DEFAULT_OPTIONS,
} from "./store";

export const TEMPLATES = [
	{
		id: "weekly-digest",
		name: "Weekly PR digest",
		prompt:
			"Summarize the pull requests merged this week: what changed for users, what changed underneath, and anything still risky.",
		cadence: "weekly",
		icon: "calendar",
		description: "Fridays · summarize merged PRs",
	},
	{
		id: "docs-in-sync",
		name: "Keep docs in sync",
		prompt:
			"Read what changed since the last run and update the README and docs where they no longer match the code. Keep the edits small.",
		cadence: "daily",
		icon: "file-edit",
		description: "Daily · update the README",
	},
	{
		id: "security-scan",
		name: "Security scan",
		prompt:
			"Audit dependencies for known vulnerabilities and look for secrets committed to the repository. Report what you find and propose the smallest safe fixes.",
		cadence: "daily",
		icon: "shield",
		description: "Nightly · audit deps and secrets",
	},
	{
		id: "critical-bugs",
		name: "Find critical bugs",
		prompt:
			"Inspect this project for critical bugs. Fix clear defects, run relevant tests, and explain what changed.",
		cadence: "daily",
	},
	{
		id: "review-pulls",
		name: "Review pull requests",
		prompt:
			"Review newly opened pull requests for correctness, security, and missing tests. Report actionable findings.",
		event: "pull_opened",
	},
	{
		id: "failing-checks",
		name: "Watch failing checks",
		prompt:
			"Investigate failing checks on my pull request. Fix the cause when safe and report the result.",
		event: "checks_failed",
	},
	{
		id: "test-coverage",
		name: "Add test coverage",
		prompt: "Find an important untested behavior in this project and add a focused test for it.",
		cadence: "weekly",
	},
	{
		id: "dependencies",
		name: "Audit dependencies",
		prompt:
			"Audit this project's dependencies for known security issues and propose the smallest safe updates.",
		cadence: "weekly",
	},
	{
		id: "changelog",
		name: "Weekly changelog",
		prompt:
			"Summarize this week's merged changes as a concise changelog with links and user impact.",
		cadence: "weekly",
	},
] as const;

async function boundedJson(request: Request): Promise<unknown> {
	if (Number(request.headers.get("content-length")) > 32_768)
		throw new AutomationError("Request is too large", 413);
	const reader = request.body?.getReader();
	if (!reader) throw new AutomationError("Send a JSON body", 400);
	const chunks: Uint8Array[] = [];
	let size = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > 32_768) {
			await reader.cancel();
			throw new AutomationError("Request is too large", 413);
		}
		chunks.push(value);
	}
	try {
		return JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
	} catch {
		throw new AutomationError("Send valid JSON", 400);
	}
}

async function inputOf(
	body: unknown,
	who: Who,
	chat: ChatHub,
	githubConnected: boolean,
): Promise<AutomationInput> {
	if (!body || typeof body !== "object" || Array.isArray(body))
		throw new AutomationError("Fill in the automation", 400);
	const value = body as Record<string, unknown>;
	const trimmed = (key: string, max: number): string => {
		const item = value[key];
		if (typeof item !== "string" || !item.trim() || item.length > max)
			throw new AutomationError(`${key} is required (up to ${max} characters)`, 400);
		return item.trim();
	};
	const name = trimmed("name", 120),
		prompt = trimmed("prompt", 10_000),
		project = trimmed("project", 100),
		provider = trimmed("provider", 50);
	if (
		!/^[a-z0-9][a-z0-9-]*$/.test(project) ||
		!Object.hasOwn(chat.projectFolders(who.workspace), project)
	)
		throw new AutomationError("Link this project to a folder first", 400);
	if (value.workspaceMode !== "folder" && value.workspaceMode !== "worktree")
		throw new AutomationError("Choose a folder or worktree", 400);
	if (typeof value.enabled !== "boolean")
		throw new AutomationError("Choose whether this automation is enabled", 400);
	if (!validTriggers(value.triggers))
		throw new AutomationError("Choose one to five valid triggers and a time zone", 400);
	if (value.triggers.some((trigger) => trigger.kind === "event") && !githubConnected)
		throw new AutomationError("Connect GitHub before using GitHub triggers", 400);
	const providers = await chat.providerList(who.userId);
	const info = providers.find((item) => item.id === provider && item.available);
	if (!info) throw new AutomationError("Choose an installed agent", 400);
	const optional = (key: string): string | null => {
		const item = value[key];
		if (item === null || item === undefined || item === "") return null;
		if (typeof item !== "string" || item.length > 120)
			throw new AutomationError(`Invalid ${key}`, 400);
		return item;
	};
	const model = optional("model"),
		effort = optional("effort"),
		mode = optional("mode");
	if (model && !info.models.some((item) => item.id === model))
		throw new AutomationError("Choose a model this agent offers", 400);
	if (mode && !info.modes.some((item) => item.id === mode))
		throw new AutomationError("Choose a mode this agent offers", 400);
	const selected = info.models.find((item) => item.id === model);
	if (effort && !selected?.efforts?.some((item) => item.id === effort))
		throw new AutomationError("Choose an effort this model offers", 400);
	return {
		name,
		prompt,
		project,
		provider,
		model,
		effort,
		mode,
		workspaceMode: value.workspaceMode,
		enabled: value.enabled,
		triggers: value.triggers,
		options: optionsOf(value.options),
	};
}

/** The recipe's role, branch and after, and its guardrails, checked one by one. */
export function optionsOf(raw: unknown): AutomationOptions {
	if (raw === undefined || raw === null) return { ...DEFAULT_OPTIONS };
	if (typeof raw !== "object" || Array.isArray(raw))
		throw new AutomationError("Invalid options", 400);
	const value = raw as Record<string, unknown>;
	const text = (key: string, max: number, pattern?: RegExp): string | null => {
		const item = value[key];
		if (item === undefined || item === null || item === "") return null;
		if (typeof item !== "string" || item.length > max || (pattern && !pattern.test(item)))
			throw new AutomationError(`Invalid ${key}`, 400);
		return item;
	};
	const flag = (key: string) => value[key] === true;
	const number = (key: string, min: number, max: number): number | null => {
		const item = value[key];
		if (item === undefined || item === null || item === "") return null;
		if (typeof item !== "number" || !Number.isFinite(item) || item < min || item > max)
			throw new AutomationError(`${key} must be between ${min} and ${max}`, 400);
		return item;
	};
	const offLimits = value.offLimits ?? [];
	if (
		!Array.isArray(offLimits) ||
		offLimits.length > 20 ||
		offLimits.some((item) => typeof item !== "string" || !item.trim() || item.length > 200)
	)
		throw new AutomationError("List up to 20 off-limits paths", 400);
	const minutes = number("minutes", 1, 24 * 60);
	return {
		role: text("role", 120, /^[\w-]+$/),
		branch: text("branch", 200, /^(?!.*\.\.)(?!-)[\w./-]+$/),
		pullRequest: flag("pullRequest"),
		waitForReview: flag("pullRequest") && flag("waitForReview"),
		minutes: minutes === null ? null : Math.round(minutes),
		budgetUsd: number("budgetUsd", 0.01, 1000),
		offLimits: (offLimits as string[]).map((item) => item.trim()),
		icon: text("icon", 24, /^[a-z-]+$/),
	};
}

function owner(item: Automation | null, who: Who): Automation {
	if (!item) throw new AutomationError("Automation not found", 404);
	if (item.ownerId !== who.userId)
		throw new AutomationError("Only the owner can change this automation", 403);
	return item;
}

export async function automationRequest(
	request: Request,
	url: URL,
	who: Who,
	service: Automations,
	chat: ChatHub,
	githubConnected: boolean,
): Promise<Response> {
	try {
		const path = url.pathname.split("/").filter(Boolean);
		const method = request.method;
		if (path.length === 2 && path[1] === "templates") {
			if (method !== "GET") throw new AutomationError("Use GET", 405);
			return Response.json({ data: TEMPLATES });
		}
		if (path.length === 1) {
			if (method === "GET")
				return Response.json({
					data: service.store
						.list(who.workspace)
						.map((item) => ({ ...item, lastRun: service.store.last(who.workspace, item.id) })),
				});
			if (method === "POST") {
				if (service.store.list(who.workspace).length >= 200)
					throw new AutomationError(
						"This workspace has 200 automations; remove one before adding another",
						409,
					);
				const input = await inputOf(await boundedJson(request), who, chat, githubConnected);
				const item = service.store.create(who.workspace, who.userId, input);
				service.changed();
				return Response.json({ data: item }, { status: 201 });
			}
			throw new AutomationError("Use GET or POST", 405);
		}
		const id = path[1];
		if (!id || !/^[\w-]{1,120}$/.test(id) || path.length > 3)
			throw new AutomationError("Not found", 404);
		const item = service.store.get(who.workspace, id);
		if (path.length === 3 && path[2] === "runs") {
			if (method !== "GET") throw new AutomationError("Use GET", 405);
			if (!item) throw new AutomationError("Automation not found", 404);
			return Response.json({ data: service.store.runs(who.workspace, id) });
		}
		if (path.length === 3 && path[2] === "run") {
			if (method !== "POST") throw new AutomationError("Use POST", 405);
			return Response.json({ data: service.runNow(who, id) }, { status: 202 });
		}
		if (path.length === 3 && path[2] === "toggle") {
			if (method !== "POST") throw new AutomationError("Use POST", 405);
			const previous = owner(item, who);
			const changed = service.store.update(previous, { ...previous, enabled: !previous.enabled });
			service.changed();
			return Response.json({ data: changed });
		}
		if (path.length !== 2) throw new AutomationError("Not found", 404);
		if (method === "GET") {
			if (!item) throw new AutomationError("Automation not found", 404);
			return Response.json({ data: item });
		}
		if (method === "PUT") {
			const previous = owner(item, who);
			const changed = service.store.update(
				previous,
				await inputOf(await boundedJson(request), who, chat, githubConnected),
			);
			service.changed();
			return Response.json({ data: changed });
		}
		if (method === "DELETE") {
			const previous = owner(item, who);
			if (service.store.active(previous.id))
				throw new AutomationError("Wait for this run to finish before deleting", 409);
			service.store.delete(previous);
			service.changed();
			return new Response(null, { status: 204 });
		}
		throw new AutomationError("Use GET, PUT or DELETE", 405);
	} catch (cause) {
		if (cause instanceof AutomationError)
			return Response.json({ message: cause.message }, { status: cause.status });
		throw cause;
	}
}
