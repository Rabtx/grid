import type { Who } from "../auth";

import { MAX_ROLES, ROLE_ICONS, type RoleDraft, type RoleIcon, type RoleStore } from "./store";

export type RoleDeps = {
	store: RoleStore;
	/** Whether this runner knows the agent, so a role cannot name one that does not exist. */
	knownProvider: (id: string) => boolean;
	/** A teammate was removed: what it kept goes with it. */
	onRemoved?: (workspace: string, id: string) => void;
};

const NAME_MAX = 40;
const SPECIALTY_MAX = 60;
/** Skills or connectors one teammate may name: its domain's, not the whole catalogue. */
const LIST_MAX = 40;
const PARALLEL_MAX = 5;
const BRIEF_MAX = 2000;
const CHOICE_MAX = 200;

type Parsed = { draft: Partial<RoleDraft> } | { error: string };

/**
 * A role as the console sends it, checked field by field. `partial` is an edit: only what is
 * there changes. A model, effort or mode sent as null (or "") goes back to the agent's default.
 */
export function parseRole(body: unknown, partial: boolean, deps: RoleDeps): Parsed {
	if (!body || typeof body !== "object") return { error: "Send the role" };
	const input = body as Record<string, unknown>;
	const draft: Partial<RoleDraft> = {};

	if (input.name !== undefined || !partial) {
		if (typeof input.name !== "string") return { error: "Give the role a name" };
		const name = input.name.replace(/\s+/g, " ").trim();
		if (!name) return { error: "Give the role a name" };
		if (name.length > NAME_MAX) return { error: `Keep the name under ${NAME_MAX} characters` };
		draft.name = name;
	}
	if (input.icon !== undefined || !partial) {
		const icon = input.icon ?? "code";
		if (typeof icon !== "string" || !(ROLE_ICONS as readonly string[]).includes(icon))
			return { error: "That is not one of the role icons" };
		draft.icon = icon as RoleIcon;
	}
	if (input.brief !== undefined || !partial) {
		const brief = input.brief ?? "";
		if (typeof brief !== "string") return { error: "Say what the role does in words" };
		if (brief.length > BRIEF_MAX)
			return { error: `Keep what the role does under ${BRIEF_MAX} characters` };
		draft.brief = brief.trim();
	}
	if (input.provider !== undefined || !partial) {
		if (typeof input.provider !== "string" || !deps.knownProvider(input.provider))
			return { error: "Choose an agent this machine has" };
		draft.provider = input.provider;
	}
	for (const key of ["model", "effort", "mode"] as const) {
		const value = input[key];
		if (value === undefined) {
			if (!partial) draft[key] = null;
			continue;
		}
		if (value === null || value === "") {
			draft[key] = null;
			continue;
		}
		if (typeof value !== "string" || value.length > CHOICE_MAX)
			return { error: `That ${key} is not one this agent offers` };
		draft[key] = value;
	}
	if (input.specialty !== undefined || !partial) {
		const specialty = input.specialty ?? "";
		if (typeof specialty !== "string") return { error: "Say what the teammate is in words" };
		const trimmed = specialty.replace(/\s+/g, " ").trim();
		if (trimmed.length > SPECIALTY_MAX)
			return { error: `Keep the specialty under ${SPECIALTY_MAX} characters` };
		draft.specialty = trimmed;
	}
	if (input.skills !== undefined) {
		const list = idList(input.skills);
		if (!list) return { error: "Choose skills from the workspace's skills" };
		draft.skills = list;
	}
	if (input.connectors !== undefined) {
		if (input.connectors === null) draft.connectors = null;
		else {
			const list = idList(input.connectors);
			if (!list) return { error: "Choose connectors from the workspace's connectors" };
			draft.connectors = list;
		}
	}
	for (const [key, field] of [
		["autoStart", "autoStart"],
		["planFirst", "planFirst"],
	] as const) {
		if (input[key] === undefined) continue;
		if (typeof input[key] !== "boolean") return { error: `${key} is on or off` };
		draft[field] = input[key] as boolean;
	}
	if (input.parallel !== undefined) {
		const parallel = input.parallel;
		if (
			typeof parallel !== "number" ||
			!Number.isInteger(parallel) ||
			parallel < 1 ||
			parallel > PARALLEL_MAX
		)
			return { error: `A teammate works on 1 to ${PARALLEL_MAX} cards at once` };
		draft.parallel = parallel;
	}
	if (input.handoffTo !== undefined) {
		if (input.handoffTo === null || input.handoffTo === "") draft.handoffTo = null;
		else if (typeof input.handoffTo !== "string" || input.handoffTo.length > CHOICE_MAX)
			return { error: "Hand finished cards to a teammate on this team" };
		else draft.handoffTo = input.handoffTo;
	}
	return { draft };
}

/** A list of ids, each a short string, without repeats; null when it is not one. */
function idList(value: unknown): string[] | null {
	if (!Array.isArray(value) || value.length > LIST_MAX) return null;
	if (!value.every((item) => typeof item === "string" && item.length > 0 && item.length <= 100))
		return null;
	return [...new Set(value as string[])];
}

/**
 * A workspace's roles over HTTP: `GET /roles` lists them, `POST /roles` makes one, and
 * `PATCH` / `DELETE /roles/:id` change or remove one. Returns null for paths it does not own.
 */
export async function roleRequest(
	request: Request,
	url: URL,
	who: Who,
	deps: RoleDeps,
): Promise<Response | null> {
	const { store } = deps;
	const { workspace } = who;

	if (url.pathname === "/roles") {
		if (request.method === "GET") return Response.json({ data: store.list(workspace) });
		if (request.method === "POST") {
			if (tooLarge(request)) return failure(413, "That role is too large");
			const parsed = parseRole(await request.json().catch(() => null), false, deps);
			if ("error" in parsed) return failure(400, parsed.error);
			const handoff = checkHandoff(store, workspace, null, parsed.draft.handoffTo);
			if (handoff) return failure(400, handoff);
			const role = store.create(workspace, parsed.draft as RoleDraft);
			if (!role) return failure(409, `A team keeps at most ${MAX_ROLES} roles`);
			return Response.json({ data: role }, { status: 201 });
		}
		return failure(405, "Use GET or POST");
	}

	const one = url.pathname.match(/^\/roles\/([\w-]+)$/);
	if (one) {
		const id = one[1];
		if (request.method === "PATCH") {
			if (tooLarge(request)) return failure(413, "That role is too large");
			const parsed = parseRole(await request.json().catch(() => null), true, deps);
			if ("error" in parsed) return failure(400, parsed.error);
			const handoff = checkHandoff(store, workspace, id, parsed.draft.handoffTo);
			if (handoff) return failure(400, handoff);
			const role = store.update(workspace, id, parsed.draft);
			return role ? Response.json({ data: role }) : failure(404, "That role is gone");
		}
		if (request.method === "DELETE") {
			// Removing a role that is already gone is what was asked for.
			if (store.remove(workspace, id)) deps.onRemoved?.(workspace, id);
			return new Response(null, { status: 204 });
		}
		return failure(405, "Use PATCH or DELETE");
	}

	return url.pathname.startsWith("/roles/") ? failure(404, "Not found") : null;
}

/** Why a hand-off cannot go where it says (not a teammate here, or back to itself), or null. */
function checkHandoff(
	store: RoleStore,
	workspace: string,
	self: string | null,
	to: string | null | undefined,
): string | null {
	if (!to) return null;
	if (to === self) return "A teammate cannot hand cards to itself";
	return store.get(workspace, to) ? null : "That teammate is not on this team";
}

/** A role is a few short fields and a brief; anything much bigger is not one. */
function tooLarge(request: Request): boolean {
	return Number(request.headers.get("content-length")) > 32_768;
}

function failure(status: number, message: string): Response {
	return Response.json({ message }, { status });
}
