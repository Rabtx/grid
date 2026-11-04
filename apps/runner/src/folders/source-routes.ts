import type { Who } from "../auth";
import type { ChatHub } from "../chat/hub";
import { ChatError } from "../chat/hub";
import { FolderError } from "./folders";
import { projectFilePath } from "./project-files";
import { byAgents, linkedRoot } from "./routes";
import {
	cleanMessage,
	commitFiles,
	fileDiff,
	initRepo,
	messagePrompt,
	pushBranch,
	SourceError,
	sourceStatus,
} from "./source-control";

/** The agents asked to word a commit message, in order, after the workspace's default. */
const WRITERS = ["claude", "codex", "opencode", "cursor", "grok"];
/** Agents that cannot answer outside a thread. */
const NO_WRITERS = new Set(["antigravity"]);

function failure(status: number, message: string): Response {
	return Response.json({ message }, { status });
}

/**
 * A project's source control (Files → Changes): `GET …/source` where it stands, `GET
 * …/source/diff?path=` one file's diff, and `POST …/source/init`, `/commit`, `/message` (an agent
 * words the commit message) and `/push`. Returns null for other paths.
 */
export async function sourceRequest(
	request: Request,
	url: URL,
	who: Who,
	hub: ChatHub,
	projectsDir: string,
): Promise<Response | null> {
	const match = url.pathname.match(/^\/projects\/files\/([a-z0-9-]+)\/source(?:\/([a-z]+))?$/);
	if (!match) return null;
	const [, project, action = ""] = match;
	try {
		const root = linkedRoot(hub, who.workspace, project, projectsDir);
		if (root instanceof Response) return root;
		const status = async () => {
			const found = await sourceStatus(root);
			return { ...found, changes: await byAgents(hub, who.workspace, root, found.changes) };
		};
		if (request.method === "GET" && action === "") return Response.json({ data: await status() });
		if (request.method === "GET" && action === "diff") {
			const path = projectFilePath(root, url.searchParams.get("path") ?? "");
			return Response.json({ data: await fileDiff(root, path) });
		}
		if (request.method !== "POST") return failure(405, "Not allowed");
		const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
		const paths = Array.isArray(body.paths)
			? body.paths.filter((path): path is string => typeof path === "string").slice(0, 2000)
			: [];
		if (action === "init") {
			await initRepo(root, who.settings?.defaultBranch || "main");
			return Response.json({ data: await status() });
		}
		if (action === "commit") {
			const author = body.author as { name?: unknown; email?: unknown } | undefined;
			const commit = await commitFiles(root, {
				paths,
				message: typeof body.message === "string" ? body.message.slice(0, 10_000) : "",
				...(typeof author?.name === "string" &&
				typeof author.email === "string" &&
				author.email.includes("@")
					? { author: { name: author.name.slice(0, 200), email: author.email.slice(0, 200) } }
					: {}),
			});
			return Response.json({ data: { commit, status: await status() } });
		}
		if (action === "message") {
			if (paths.length === 0) return failure(400, "Choose the files to describe");
			const prompt = await messagePrompt(root, paths);
			return Response.json({ data: await writeMessage(who, hub, root, prompt) });
		}
		if (action === "push") {
			await pushBranch(root);
			return Response.json({ data: await status() });
		}
		return failure(404, "Not found");
	} catch (cause) {
		if (cause instanceof SourceError || cause instanceof FolderError || cause instanceof ChatError)
			return failure(cause.status, cause.message);
		throw cause;
	}
}

/** A commit message from the first agent that can word one: the default, then the rest. */
async function writeMessage(
	who: Who,
	hub: ChatHub,
	cwd: string,
	prompt: string,
): Promise<{ message: string; agent: string }> {
	const available = (await hub.providerList(who.userId))
		.filter((item) => item.available && !NO_WRITERS.has(item.id))
		.map((item) => item.id);
	const preferred = who.settings?.defaultAgent;
	const order = [
		...new Set([
			...(preferred && available.includes(preferred) ? [preferred] : []),
			...WRITERS.filter((id) => available.includes(id)),
			...available,
		]),
	];
	if (order.length === 0)
		throw new SourceError("Install an agent to write commit messages (Settings → Agents)");
	let last: unknown = null;
	for (const agent of order.slice(0, 2)) {
		try {
			const message = cleanMessage(await hub.answerOnce({ provider: agent, cwd, prompt }, 90_000));
			if (message) return { message, agent };
		} catch (cause) {
			last = cause;
		}
	}
	throw last instanceof ChatError
		? last
		: new SourceError("No agent could write a commit message just now", 502);
}
