import type { ChatHub } from "../chat/hub";
import { ChatError } from "../chat/hub";
import { expandPath, FolderError, inspectFolder, listFolders } from "./folders";

/**
 * Folders on this machine, for linking projects to their code from any device: browse, look
 * inside one (name, git remote), and link a project to it. Returns null for other paths.
 */
export async function folderRequest(
	request: Request,
	url: URL,
	userId: string,
	hub: ChatHub,
): Promise<Response | null> {
	try {
		if (url.pathname === "/fs/folders" && request.method === "GET") {
			return Response.json({
				data: listFolders(url.searchParams.get("path"), {
					hidden: url.searchParams.get("hidden") === "1",
				}),
			});
		}
		if (url.pathname === "/fs/inspect" && request.method === "GET") {
			return Response.json({ data: inspectFolder(url.searchParams.get("path") ?? "") });
		}
		if (url.pathname === "/projects/folders" && request.method === "GET") {
			return Response.json({ data: hub.projectFolders(userId) });
		}
		const link = url.pathname.match(/^\/projects\/folders\/([a-z0-9-]+)$/);
		if (link && request.method === "PUT") {
			const body = (await request.json().catch(() => ({}))) as { path?: unknown };
			if (typeof body.path !== "string") return failure(400, "Say which folder");
			hub.linkProjectFolder(userId, link[1], expandPath(body.path));
			return new Response(null, { status: 204 });
		}
	} catch (cause) {
		if (cause instanceof FolderError || cause instanceof ChatError)
			return failure(cause.status, cause.message);
		throw cause;
	}
	return null;
}

function failure(status: number, message: string): Response {
	return Response.json({ message }, { status });
}
