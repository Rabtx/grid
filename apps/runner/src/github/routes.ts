import type { Who } from "../auth";
import { type CodespacesLink, GitHubError } from "./codespaces";
import type { MergeMethod, PullFilter, PullRequests } from "./pulls";

/** Pull requests, and how to find a project's folder on this machine. */
export type PullsDeps = {
	service: PullRequests;
	/** The folder a project is linked to here, or null. */
	folderOf: (workspace: string, project: string) => string | null;
};

const FILTERS = new Set<PullFilter>(["mine", "review", "open"]);
const METHODS = new Set<MergeMethod>(["merge", "squash", "rebase"]);

/**
 * GitHub over HTTP: the sign-in (`/github`), and the person's Codespaces
 * (`/github/codespaces…`). Returns null for paths it does not own.
 */
export async function githubRequest(
	request: Request,
	url: URL,
	who: Who,
	github: CodespacesLink,
	pulls?: PullsDeps,
): Promise<Response | null> {
	// Signing in to GitHub is the person's; a Codespace connected becomes the workspace's.
	const { userId, workspace } = who;
	try {
		if (url.pathname === "/github" && request.method === "GET") {
			return Response.json({ data: await github.status(userId) });
		}
		if (url.pathname === "/github/sign-in" && request.method === "POST") {
			return Response.json({ data: await github.signIn(userId) });
		}
		if (url.pathname === "/github" && request.method === "DELETE") {
			github.signOut(userId);
			return new Response(null, { status: 204 });
		}
		if (url.pathname === "/github/codespaces" && request.method === "GET") {
			return Response.json({ data: await github.list(userId, workspace) });
		}
		if (url.pathname === "/github/codespaces" && request.method === "POST") {
			const body = (await request.json().catch(() => null)) as {
				repository?: unknown;
				branch?: unknown;
			} | null;
			if (typeof body?.repository !== "string") return failure(400, "Say which repository");
			const name = await github.create(userId, {
				repository: body.repository.trim(),
				branch:
					typeof body.branch === "string" && body.branch.trim() ? body.branch.trim() : undefined,
			});
			return Response.json({ data: { name } }, { status: 201 });
		}
		const action = url.pathname.match(/^\/github\/codespaces\/([\w-]+)\/(start|stop|connect)$/);
		if (action && request.method === "POST") {
			const [, name, verb] = action;
			if (verb === "start") await github.start(userId, name);
			else if (verb === "stop") await github.stop(userId, name);
			else github.connect(userId, workspace, name);
			return new Response(null, { status: verb === "connect" ? 202 : 204 });
		}
		const pull =
			pulls && url.pathname.match(/^\/github\/pulls\/([a-z0-9-]+)(?:\/(\d+)(?:\/(\w+))?)?$/);
		if (pulls && pull) return await pullRequest(request, url, who, pulls, pull);
		return url.pathname.startsWith("/github") ? failure(404, "Not found") : null;
	} catch (cause) {
		if (cause instanceof GitHubError) return failure(cause.status, cause.message);
		throw cause;
	}
}

/**
 * `/github/pulls/<project>` lists (`?filter=mine|review|open`); `/<number>` opens one, `/diff` its
 * changed files; POST `/merge` (`{ method }`), `/ready`, `/draft`, `/close`, `/comment` (`{ body }`).
 */
async function pullRequest(
	request: Request,
	url: URL,
	who: Who,
	pulls: PullsDeps,
	[, project, rawNumber, action]: RegExpMatchArray,
): Promise<Response> {
	const folder = pulls.folderOf(who.workspace, project);
	if (!folder) return failure(409, "Choose this project's folder first");
	const { service } = pulls;
	const { userId } = who;
	if (!rawNumber) {
		if (request.method !== "GET") return failure(405, "Not allowed");
		const filter = (url.searchParams.get("filter") ?? "open") as PullFilter;
		if (!FILTERS.has(filter)) return failure(400, "Unknown filter");
		return Response.json({ data: await service.list(userId, folder, filter) });
	}
	const number = Number(rawNumber);
	if (!action && request.method === "GET") {
		return Response.json({ data: await service.view(userId, folder, number) });
	}
	if (action === "diff" && request.method === "GET") {
		return Response.json({ data: await service.diff(userId, folder, number) });
	}
	if (request.method !== "POST") return failure(405, "Not allowed");
	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	switch (action) {
		case "merge": {
			const method = (body.method ?? "merge") as MergeMethod;
			if (!METHODS.has(method)) return failure(400, "Merge, squash or rebase");
			await service.merge(userId, folder, number, method);
			break;
		}
		case "ready":
		case "draft":
			await service.ready(userId, folder, number, action === "ready");
			break;
		case "close":
			await service.close(userId, folder, number);
			break;
		case "comment": {
			const text = typeof body.body === "string" ? body.body.trim() : "";
			if (!text) return failure(400, "Write a comment");
			await service.comment(userId, folder, number, text);
			break;
		}
		default:
			return failure(404, "Not found");
	}
	return new Response(null, { status: 204 });
}

function failure(status: number, message: string): Response {
	return Response.json({ message }, { status });
}
