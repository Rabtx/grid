import { realpathSync } from "node:fs";
import { join } from "node:path";

import type { ChatHub } from "../chat/hub";
import { ChatError } from "../chat/hub";
import { expandPath, FolderError, insideProjectsDir, inspectFolder, listFolders } from "./folders";
import { checkout, GitError, gitInfo } from "./git";
import {
	createProjectFile,
	listProjectFiles,
	projectFilePath,
	type ProjectFileWrite,
	readProjectFile,
	searchProjectFiles,
	writeProjectFile,
} from "./project-files";
import {
	blame,
	committedText,
	type FileChange,
	gitUser,
	headTime,
	lastChanges,
	projectGit,
	repoPrefix,
} from "./project-git";

/** A save's JSON: the file's text (at most 512 KB) plus escaping and the other fields. */
const MAX_SAVE_BODY_BYTES = 1024 * 1024;

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
		// Who wrote each line of a file, and in which commit.
		const blamed = url.pathname.match(/^\/projects\/files\/([a-z0-9-]+)\/blame$/);
		if (blamed && request.method === "GET") {
			const root = linkedRoot(hub, userId, blamed[1], projectsDir);
			if (root instanceof Response) return root;
			const path = projectFilePath(root, url.searchParams.get("path") ?? "");
			if ((await repoPrefix(root)) === null) return failure(409, "This folder is not in git");
			const lines = await blame(root, path, await gitUser(root));
			if (!lines) return failure(404, "git has nothing to say about this file yet");
			// Lines not committed yet are the agent's when an agent was the last to edit the file.
			const [change] = await byAgents(hub, root, [
				{ path, status: "modified", added: null, removed: null },
			]);
			const commits = lines.commits.map((commit) =>
				commit.sha === null && change?.agent
					? { ...commit, agent: change.agent, at: change.editedAt ?? null }
					: commit.sha === null
						? { ...commit, mine: true }
						: commit,
			);
			return Response.json({ data: { path, commits, lines: lines.lines } });
		}
		// One file's contents: GET reads it, PUT saves an edit onto the version that was read.
		const content = url.pathname.match(/^\/projects\/files\/([a-z0-9-]+)\/content$/);
		if (content && (request.method === "GET" || request.method === "PUT")) {
			const root = linkedRoot(hub, userId, content[1], projectsDir);
			if (root instanceof Response) return root;
			if (request.method === "GET") {
				const file = readProjectFile(root, url.searchParams.get("path") ?? "");
				// What git says about it: how it stands, who last changed it, and the committed text
				// (so the console can show what changed). Only for a path already checked as inside.
				const prefix = await repoPrefix(root);
				if (prefix === null) return Response.json({ data: { ...file, git: null } });
				const folder = file.path.split("/").slice(0, -1).join("/");
				const me = await gitUser(root);
				const [repo, last] = await Promise.all([
					projectGit(root, prefix),
					lastChanges(root, prefix, folder, [file.path], me),
				]);
				const changes = await byAgents(hub, root, repo.changes);
				const change = changes.find((item) => item.path === file.path) ?? null;
				// The committed text only where there is a change to show against it.
				const base =
					change && change.status !== "added" && file.text !== null
						? await committedText(root, file.path)
						: null;
				return Response.json({
					data: {
						...file,
						git: {
							branch: repo.branch,
							changed: changes.length,
							change,
							last: last[file.path] ?? null,
							base,
						},
					},
				});
			}
			const body = await boundedJson(request, MAX_SAVE_BODY_BYTES);
			if (body instanceof Response) return body;
			if (
				typeof body.path !== "string" ||
				typeof body.text !== "string" ||
				typeof body.base !== "string"
			)
				return failure(400, "Say which file, what to write and which version you read");
			const write: ProjectFileWrite = { path: body.path, text: body.text, base: body.base };
			return Response.json({ data: writeProjectFile(root, write) });
		}
		const files = url.pathname.match(/^\/projects\/files\/([a-z0-9-]+)$/);
		if (files && (request.method === "GET" || request.method === "POST")) {
			const root = linkedRoot(hub, userId, files[1], projectsDir);
			if (root instanceof Response) return root;
			if (request.method === "GET") {
				const listing = listProjectFiles(root, url.searchParams.get("path") ?? "");
				// The folder's git story: the branch, what is changed, and each entry's last commit.
				const prefix = url.searchParams.get("git") === "1" ? await repoPrefix(root) : null;
				if (prefix === null) return Response.json({ data: { ...listing, git: null } });
				const me = await gitUser(root);
				const [repo, last] = await Promise.all([
					projectGit(root, prefix),
					lastChanges(
						root,
						prefix,
						listing.path,
						listing.entries.map((entry) => entry.path),
						me,
					),
				]);
				const changes = await byAgents(hub, root, repo.changes);
				return Response.json({ data: { ...listing, git: { ...repo, changes, last } } });
			}
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

/**
 * A change not committed yet, and the agent that made it when an agent was the last to edit: when,
 * and the thread it was working in.
 */
type AttributedChange = FileChange & {
	agent: string | null;
	editedAt: string | null;
	thread: { id: string; title: string | null } | null;
};

/**
 * Says which changes an agent made: a file an agent edited after the checked-out commit was
 * made is that agent's change. Edits before it were committed (or undone) since.
 */
async function byAgents(
	hub: ChatHub,
	root: string,
	changes: readonly FileChange[],
): Promise<AttributedChange[]> {
	if (changes.length === 0) return [];
	let base = root;
	try {
		base = realpathSync(root);
	} catch {
		// The folder went away mid-request; nothing will match, and that is the honest answer.
	}
	const since = await headTime(base);
	const edits = hub.agentEdits(changes.map((change) => join(base, change.path)));
	return changes.map((change) => {
		const edit = edits.get(join(base, change.path));
		const after = edit && (since === null || Date.parse(edit.at) > Date.parse(since));
		return after
			? {
					...change,
					agent: edit.provider,
					editedAt: edit.at,
					thread: { id: edit.sessionId, title: edit.title },
				}
			: { ...change, agent: null, editedAt: null, thread: null };
	});
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

/**
 * A JSON body read no further than `limit` bytes: refused up front by its Content-Length, and
 * cut off while reading when it has none or understates it.
 */
async function boundedJson(
	request: Request,
	limit: number,
): Promise<Record<string, unknown> | Response> {
	const tooLarge = () => failure(413, "This file would be too large to save");
	if (Number(request.headers.get("content-length") ?? 0) > limit) return tooLarge();
	const reader = request.body?.getReader();
	if (!reader) return {};
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.length;
			if (size > limit) {
				await reader.cancel();
				return tooLarge();
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	try {
		const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
		return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}

function failure(status: number, message: string): Response {
	return Response.json({ message }, { status });
}
