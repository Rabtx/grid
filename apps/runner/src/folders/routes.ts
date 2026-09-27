import type { ChatHub } from "../chat/hub";
import { ChatError } from "../chat/hub";
import { expandPath, FolderError, insideProjectsDir, inspectFolder, listFolders } from "./folders";
import { checkout, GitError, gitInfo } from "./git";
import {
	createProjectFile,
	listProjectFiles,
	readProjectFile,
	searchProjectFiles,
} from "./project-files";

/**
 * Folders on this machine, for linking projects to their code from any device: browse, look
 * inside one (name, git remote), and link a project to it. Returns null for other paths.
 */
export async function folderRequest(
	request: Request,
	url: URL,
	userId: string,
	hub: ChatHub,
	projectsDir: string,
): Promise<Response | null> {
	try {
		const search = url.pathname.match(/^\/projects\/files\/([a-z0-9-]+)\/search$/);
		if (search && request.method === "GET") {
			const root = linkedRoot(hub, userId, search[1], projectsDir);
			if (root instanceof Response) return root;
			return Response.json({ data: searchProjectFiles(root, url.searchParams.get("q") ?? "") });
		}
		const content = url.pathname.match(/^\/projects\/files\/([a-z0-9-]+)\/content$/);
		if (content && request.method === "GET") {
			const root = linkedRoot(hub, userId, content[1], projectsDir);
			if (root instanceof Response) return root;
			return Response.json({ data: readProjectFile(root, url.searchParams.get("path") ?? "") });
		}
		const files = url.pathname.match(/^\/projects\/files\/([a-z0-9-]+)$/);
		if (files && (request.method === "GET" || request.method === "POST")) {
			const root = linkedRoot(hub, userId, files[1], projectsDir);
			if (root instanceof Response) return root;
			if (request.method === "GET")
				return Response.json({ data: listProjectFiles(root, url.searchParams.get("path") ?? "") });
			const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
			if (
				typeof body.path !== "string" ||
				typeof body.name !== "string" ||
				(body.kind !== "file" && body.kind !== "folder")
			)
				return failure(400, "Say which file or folder to create");
			return Response.json(
				{ data: createProjectFile(root, body.path, body.name, body.kind) },
				{ status: 201 },
			);
		}
		if (url.pathname === "/fs/folders" && request.method === "GET") {
			const root = insideProjectsDir(projectsDir, projectsDir);
			const path = insideProjectsDir(
				expandPath(url.searchParams.get("path") || projectsDir),
				projectsDir,
			);
			const listing = listFolders(path, {
				hidden: url.searchParams.get("hidden") === "1",
			});
			return Response.json({
				data: {
					...listing,
					parent: listing.path === root ? null : listing.parent,
					home: root,
				},
			});
		}
		// The composer's git control: a folder's branch and branches, and switching or creating one.
		if (url.pathname === "/fs/git" && request.method === "GET") {
			const path = insideProjectsDir(expandPath(url.searchParams.get("path") ?? ""), projectsDir);
			return Response.json({ data: gitInfo(path) });
		}
		if (url.pathname === "/fs/git/checkout" && request.method === "POST") {
			const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
			if (typeof body.path !== "string" || typeof body.branch !== "string")
				return failure(400, "Say which folder and which branch");
			const path = insideProjectsDir(expandPath(body.path), projectsDir);
			return Response.json({ data: checkout(path, body.branch, body.create === true) });
		}
		if (url.pathname === "/fs/inspect" && request.method === "GET") {
			const path = insideProjectsDir(
				expandPath(url.searchParams.get("path") || projectsDir),
				projectsDir,
			);
			return Response.json({ data: inspectFolder(path) });
		}
		if (url.pathname === "/projects/folders" && request.method === "GET") {
			// A folder linked before the projects folder was narrowed is left out, not an error:
			// one stale link must not hide every other project's folder.
			const folders: Record<string, string> = {};
			for (const [project, path] of Object.entries(hub.projectFolders(userId))) {
				try {
					folders[project] = insideProjectsDir(path, projectsDir);
				} catch {
					// Outside the projects folder: that project shows as needing its folder chosen.
				}
			}
			return Response.json({ data: folders });
		}
		const link = url.pathname.match(/^\/projects\/folders\/([a-z0-9-]+)$/);
		if (link && request.method === "PUT") {
			const body = (await request.json().catch(() => ({}))) as { path?: unknown };
			if (typeof body.path !== "string") return failure(400, "Say which folder");
			hub.linkProjectFolder(userId, link[1], expandPath(body.path));
			return new Response(null, { status: 204 });
		}
	} catch (cause) {
		if (cause instanceof FolderError || cause instanceof ChatError || cause instanceof GitError)
			return failure(cause.status, cause.message);
		throw cause;
	}
	return null;
}

function linkedRoot(
	hub: ChatHub,
	userId: string,
	project: string,
	projectsDir: string,
): string | Response {
	const root = hub.projectFolders(userId)[project];
	if (!root) return failure(409, "Choose this project's folder first");
	return insideProjectsDir(root, projectsDir);
}

function failure(status: number, message: string): Response {
	return Response.json({ message }, { status });
}
