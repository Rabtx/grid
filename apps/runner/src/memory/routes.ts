import type { Who } from "../auth";
import { isAdmin, NOT_ALLOWED, readOnly } from "../permissions";
import { MemoryError, type MemoryEntry, type ProjectMemory } from "./project-memory";

/**
 * A project's memory over HTTP (its Memory page). Everyone in the workspace reads it; members
 * add to it and change it; what an entry says is removed by whoever kept it or an admin.
 *
 *   GET    /memory?project=web&q=words
 *   POST   /memory                { project, kind, text }
 *   PUT    /memory/:id            { kind?, text? }
 *   DELETE /memory/:id
 */
export async function memoryRequest(
	request: Request,
	url: URL,
	who: Who & { name?: string },
	memory: ProjectMemory,
	audit?: (who: Who, action: "memory.edit" | "memory.remove", entry: MemoryEntry) => void,
): Promise<Response | null> {
	if (url.pathname !== "/memory" && !url.pathname.startsWith("/memory/")) return null;
	const failure = (status: number, message: string) => Response.json({ message }, { status });
	try {
		if (url.pathname === "/memory" && request.method === "GET") {
			const project = url.searchParams.get("project") ?? "";
			if (!project) return failure(400, "Say which project");
			const query = url.searchParams.get("q")?.trim() ?? "";
			return Response.json({
				data: query
					? memory.search(who.workspace, project, query, 100)
					: memory.list(who.workspace, project),
			});
		}
		if (readOnly(who)) return failure(403, NOT_ALLOWED);
		if (url.pathname === "/memory" && request.method === "POST") {
			const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
			const saved = memory.save({
				workspaceId: who.workspace,
				project: typeof body.project === "string" ? body.project : "",
				kind: body.kind,
				text: body.text,
				by: { kind: "person", id: who.userId, name: who.name || who.userId },
			});
			return Response.json({ data: saved.entry }, { status: saved.created ? 201 : 200 });
		}
		const one = url.pathname.match(/^\/memory\/([\w-]{1,80})$/);
		if (!one?.[1]) return failure(404, "Not found");
		if (request.method === "PUT") {
			const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
			const entry = memory.edit(who.workspace, one[1], body);
			audit?.(who, "memory.edit", entry);
			return Response.json({ data: entry });
		}
		if (request.method === "DELETE") {
			const entry = memory.get(who.workspace, one[1]);
			if (!entry) return failure(404, "No such memory");
			const theirs = entry.by.kind === "person" && entry.by.id === who.userId;
			if (!theirs && !isAdmin(who))
				return failure(403, "Only whoever kept it, or an owner or admin, removes a memory");
			memory.remove(who.workspace, one[1]);
			audit?.(who, "memory.remove", entry);
			return new Response(null, { status: 204 });
		}
		return failure(405, "Method not allowed");
	} catch (cause) {
		if (cause instanceof MemoryError) return failure(cause.status, cause.message);
		throw cause;
	}
}
