import type { Who } from "../auth";
import { may, NOT_ALLOWED } from "../permissions";
import type { Crews } from "./crews";
import { ChatError } from "./hub";

/**
 * Crews over HTTP: listing a project's crews, starting one, reading one (by its id or its
 * coordinator thread's), changing its settings, and retrying or stopping a member. Null for paths
 * it does not own.
 */
export async function crewRequest(
	request: Request,
	url: URL,
	who: Who,
	crews: Crews,
): Promise<Response | null> {
	if (!url.pathname.startsWith("/chat/crews")) return null;
	const { workspace } = who;
	try {
		if (url.pathname === "/chat/crews" && request.method === "GET") {
			const project = url.searchParams.get("project");
			if (!project) return failure(400, "Say which project");
			return Response.json({ data: crews.list(workspace, project) });
		}
		if (url.pathname === "/chat/crews" && request.method === "POST") {
			if (!may(who, "startAgents")) return failure(403, NOT_ALLOWED);
			const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
			const text = (key: string) =>
				typeof body[key] === "string" ? (body[key] as string) : undefined;
			const project = text("project");
			const name = text("name");
			const provider = text("provider");
			if (!project || !name || !provider)
				return failure(400, "Say the project, the crew's name and its agent");
			const made = crews.create(who, {
				project,
				name,
				provider,
				instructions: text("instructions"),
				model: text("model"),
				workerProvider: text("workerProvider"),
				workerModel: text("workerModel"),
				parallel: typeof body.parallel === "number" ? body.parallel : undefined,
				cwd: text("cwd"),
			});
			return Response.json({ data: made }, { status: 201 });
		}
		const one = url.pathname.match(/^\/chat\/crews\/([\w-]+)$/);
		if (one && request.method === "GET") {
			const crew = crews.find(workspace, one[1] ?? "");
			return Response.json({ data: crew });
		}
		if (one && request.method === "PATCH") {
			if (!may(who, "startAgents")) return failure(403, NOT_ALLOWED);
			const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
			return Response.json({
				data: crews.update(workspace, one[1] ?? "", {
					...(typeof body.name === "string" ? { name: body.name } : {}),
					...(typeof body.instructions === "string"
						? { instructions: body.instructions.slice(0, 16_000) }
						: {}),
					...(typeof body.workerProvider === "string"
						? { workerProvider: body.workerProvider }
						: {}),
					...(typeof body.workerModel === "string" || body.workerModel === null
						? { workerModel: body.workerModel as string | null }
						: {}),
					...(typeof body.parallel === "number" ? { parallel: body.parallel } : {}),
					...(typeof body.paused === "boolean" ? { paused: body.paused } : {}),
				}),
			});
		}
		const member = url.pathname.match(/^\/chat\/crews\/([\w-]+)\/workers\/([\w-]+)\/(retry|stop)$/);
		if (member && request.method === "POST") {
			if (!may(who, "startAgents")) return failure(403, NOT_ALLOWED);
			const [, crew = "", worker = "", action] = member;
			if (action === "retry") await crews.retry(workspace, crew, worker);
			else crews.stopWorker(workspace, crew, worker);
			return new Response(null, { status: 204 });
		}
		return failure(405, "Method not allowed");
	} catch (cause) {
		if (cause instanceof ChatError) return failure(cause.status, cause.message);
		throw cause;
	}
}

function failure(status: number, message: string): Response {
	return Response.json({ message }, { status });
}
