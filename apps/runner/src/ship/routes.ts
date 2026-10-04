import type { Who } from "../auth";
import { GitHubError } from "../github/codespaces";
import { type Ship, ShipError } from "./service";

function failure(status: number, message: string): Response {
	return Response.json({ message }, { status });
}

function text(value: unknown): string | undefined {
	return typeof value === "string" ? value.trim().slice(0, 2_000) : undefined;
}

/**
 * Ship over HTTP, per project: `GET /ship/<project>` (environments, previews, pipelines), `/env/<name>`
 * (one environment) with POST `/promote` (`{ watch }`), `/rollback` (`{ id }`) and PUT `/settings`;
 * `/previews`; `/pipelines/<main|number>` with GET `/log` (why it failed), POST `/rerun` (`{ failed, check? }`)
 * and `/push`.
 */
export async function shipRequest(
	request: Request,
	url: URL,
	who: Who,
	ship: Ship,
): Promise<Response | null> {
	const match = url.pathname.match(
		/^\/ship\/([a-z0-9-]+)(?:\/(env|previews|pipelines)(?:\/([^/]+))?(?:\/(promote|rollback|settings|rerun|push|log))?)?$/,
	);
	if (!match) return url.pathname.startsWith("/ship") ? failure(404, "Not found") : null;
	const [, project = "", section, rawName, action] = match;
	let name: string;
	try {
		name = rawName ? decodeURIComponent(rawName) : "";
	} catch {
		return failure(400, "Bad name");
	}
	try {
		if (request.method === "GET" && section === "pipelines" && name && action === "log")
			return Response.json({ data: await ship.failureLog(who, project, name) });
		if (request.method === "GET" && !action) {
			if (!section) return Response.json({ data: await ship.overview(who, project) });
			if (section === "env" && name)
				return Response.json({ data: await ship.environment(who, project, name) });
			if (section === "previews" && !name)
				return Response.json({ data: await ship.previews(who, project) });
			if (section === "pipelines" && name)
				return Response.json({ data: await ship.pipeline(who, project, name) });
			return failure(404, "Not found");
		}
		const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
		if (section === "env" && name && action === "promote" && request.method === "POST")
			return Response.json({
				data: await ship.promote(who, project, name, { watch: body.watch === true }),
			});
		if (section === "env" && name && action === "rollback" && request.method === "POST") {
			if (typeof body.id !== "number") return failure(400, "Say which deploy");
			return Response.json({ data: await ship.rollback(who, project, name, body.id) });
		}
		if (section === "env" && name && action === "settings" && request.method === "PUT") {
			ship.setSettings(who, project, name, {
				url: text(body.url),
				promote: text(body.promote),
				rollback: text(body.rollback),
			});
			return new Response(null, { status: 204 });
		}
		if (section === "pipelines" && name && action === "rerun" && request.method === "POST") {
			await ship.rerun(who, project, name, {
				failed: body.failed !== false,
				check: text(body.check) || undefined,
			});
			return new Response(null, { status: 202 });
		}
		if (section === "pipelines" && name && action === "push" && request.method === "POST") {
			const number = Number(name);
			if (!Number.isInteger(number)) return failure(400, "Only a pull request's thread can push");
			await ship.pushFix(who, project, number);
			return new Response(null, { status: 202 });
		}
		return failure(405, "Not allowed");
	} catch (cause) {
		if (cause instanceof ShipError || cause instanceof GitHubError)
			return failure(cause.status, cause.message);
		throw cause;
	}
}
