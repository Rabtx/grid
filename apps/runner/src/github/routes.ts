import type { Who } from "../auth";
import { may, NOT_ALLOWED } from "../permissions";
import { type CodespacesLink, GitHubError } from "./codespaces";
import { type FixInclude, fixPlan } from "./fix";
import type { MergeMethod, PullFilter, PullRequests, PullState, ReviewSubmission } from "./pulls";

/** The Grid thread working on a branch: who made a pull request from it. */
export type BranchThread = { id: string; title: string; provider: string; role: string | null };

/** Pull requests, and how to find a project's folder on this machine. */
export type PullsDeps = {
	service: PullRequests;
	/** The folder a project is linked to here, or null. */
	folderOf: (workspace: string, project: string) => string | null;
	/** The threads working on each of a project's branches, by their worktree's branch. */
	threadsOf?: (workspace: string, project: string) => Map<string, BranchThread>;
};

const STATES = new Set<PullState>(["open", "merged", "closed"]);
const EVENTS = new Set<ReviewSubmission["event"]>(["APPROVE", "COMMENT", "REQUEST_CHANGES"]);

/** A pull request with the Grid thread that made it, when one did. */
function withThread<T extends { branch: string }>(
	pull: T,
	threads: Map<string, BranchThread> | undefined,
): T & { thread: BranchThread | null } {
	return { ...pull, thread: threads?.get(pull.branch) ?? null };
}

/** Review comments as the console sends them, checked one by one. */
function readComments(raw: unknown): ReviewSubmission["comments"] | null {
	if (!Array.isArray(raw) || raw.length > 100) return null;
	const comments: ReviewSubmission["comments"] = [];
	for (const item of raw as Record<string, unknown>[]) {
		const { path, line, side, body } = item ?? {};
		if (
			typeof path !== "string" ||
			!path ||
			typeof line !== "number" ||
			!Number.isInteger(line) ||
			line < 1 ||
			(side !== "LEFT" && side !== "RIGHT") ||
			typeof body !== "string" ||
			!body.trim()
		)
			return null;
		comments.push({ path, line, side, body: body.trim() });
	}
	return comments;
}

const FILTERS = new Set<PullFilter>(["mine", "review", "open"]);
const METHODS = new Set<MergeMethod>(["merge", "squash", "rebase"]);

/** Which parts of a pull request to include; left out means yes, only `false` turns one off. */
function readInclude(raw: unknown): FixInclude {
	const value = (raw ?? {}) as Record<string, unknown>;
	return {
		checks: value.checks !== false,
		comments: value.comments !== false,
		description: value.description !== false,
	};
}

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
		// Connecting GitHub, and Codespaces as machines, are for roles that manage them.
		const connecting =
			(url.pathname === "/github/sign-in" && request.method === "POST") ||
			(url.pathname === "/github" && request.method === "DELETE");
		if (connecting && !may(who, "integrations")) return failure(403, NOT_ALLOWED);
		if (
			url.pathname.startsWith("/github/codespaces") &&
			request.method !== "GET" &&
			!may(who, "machines")
		)
			return failure(403, NOT_ALLOWED);
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
 * changed files; POST `/merge` (`{ method }`), `/ready`, `/draft`, `/close`, `/comment` (`{ body }`),
 * and `/fix` (`{ include }`) builds the first message for a thread that fixes it.
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
	const threads = pulls.threadsOf?.(who.workspace, project);
	if (!rawNumber) {
		if (request.method !== "GET") return failure(405, "Not allowed");
		const filter = (url.searchParams.get("filter") ?? "open") as PullFilter;
		if (!FILTERS.has(filter)) return failure(400, "Unknown filter");
		const state = (url.searchParams.get("state") ?? "open") as PullState;
		if (!STATES.has(state)) return failure(400, "Open, merged or closed");
		const list = await service.list(userId, folder, filter, state);
		return Response.json({ data: list.map((pull) => withThread(pull, threads)) });
	}
	const number = Number(rawNumber);
	if (!action && request.method === "GET") {
		return Response.json({ data: withThread(await service.view(userId, folder, number), threads) });
	}
	if (action === "history" && request.method === "GET") {
		return Response.json({ data: await service.history(userId, folder, number) });
	}
	if (action === "review" && request.method === "GET") {
		return Response.json({ data: await service.review(userId, folder, number) });
	}
	if (action === "diff" && request.method === "GET") {
		return Response.json({ data: await service.diff(userId, folder, number) });
	}
	if (action === "fix" && request.method === "POST") {
		const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
		return Response.json({
			data: await fixPlan(service, userId, folder, number, readInclude(body.include)),
		});
	}
	if (request.method !== "POST") return failure(405, "Not allowed");
	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	switch (action) {
		case "merge": {
			if (!may(who, "mergePulls")) return failure(403, NOT_ALLOWED);
			const method = (body.method ?? "merge") as MergeMethod;
			if (!METHODS.has(method)) return failure(400, "Merge, squash or rebase");
			await service.mergeAndDelete(userId, folder, number, method, body.deleteBranch === true);
			break;
		}
		case "rebase":
			await service.rebase(userId, folder, number);
			break;
		case "viewed": {
			if (typeof body.path !== "string" || !body.path) return failure(400, "Say which file");
			await service.setViewed(userId, folder, number, body.path, body.viewed !== false);
			break;
		}
		case "review": {
			const event = body.event as ReviewSubmission["event"];
			if (!EVENTS.has(event)) return failure(400, "Approve, comment or request changes");
			const comments = readComments(body.comments ?? []);
			if (!comments) return failure(400, "Each comment needs a file, a line, a side and words");
			const summary = typeof body.body === "string" ? body.body : "";
			if (event !== "APPROVE" && !summary.trim() && comments.length === 0)
				return failure(400, "Say something with the review");
			await service.submitReview(userId, folder, number, { event, body: summary, comments });
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
