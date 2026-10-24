import type { Who } from "../auth";
import { BrowserError, type Browsers } from "../browser/browsers";
import { may, NOT_ALLOWED } from "../permissions";
import { ChatError, type ChatHub } from "./hub";

/**
 * A thread's browser page over HTTP, for the console's browser pane: where it is, a picture of it,
 * and the person's own clicks, typing and navigation (the same page the agent drives). Looking is
 * for anyone in the workspace; using it is for those who may start agents. Null for other paths.
 */
export async function browserRequest(
	request: Request,
	url: URL,
	who: Who,
	hub: ChatHub,
	browsers: Browsers,
): Promise<Response | null> {
	const match = url.pathname.match(/^\/chat\/browser\/([\w-]+)(?:\/(\w+))?$/);
	if (!match) return null;
	const [, thread = "", action] = match;
	try {
		hub.thread(who.workspace, thread);
		if (!action && request.method === "GET")
			return Response.json({
				data: { available: browsers.available(), ...browsers.state(thread) },
			});
		if (action === "frame" && request.method === "GET") {
			if (!browsers.state(thread).open) return failure(404, "Nothing is open in this browser");
			const shot = await browsers.screenshot(thread);
			return new Response(Buffer.from(shot.data, "base64"), {
				headers: { "content-type": shot.mimeType, "cache-control": "no-store" },
			});
		}
		if (request.method !== "POST" || !action) return failure(405, "Method not allowed");
		if (!may(who, "startAgents")) return failure(403, NOT_ALLOWED);
		const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
		const num = (key: string) => (typeof body[key] === "number" ? (body[key] as number) : null);
		switch (action) {
			case "open": {
				if (typeof body.url !== "string") return failure(400, "Say which address to open");
				return Response.json({ data: await browsers.navigate(thread, body.url) });
			}
			case "back":
				return Response.json({ data: await browsers.back(thread) });
			case "reload":
				return Response.json({ data: await browsers.reload(thread) });
			case "click": {
				const x = num("x");
				const y = num("y");
				if (x === null || y === null) return failure(400, "Say where to click");
				return Response.json({ data: await browsers.clickAt(thread, x, y) });
			}
			case "type": {
				if (typeof body.text !== "string") return failure(400, "Say what to type");
				return Response.json({ data: await browsers.type(thread, body.text.slice(0, 2_000)) });
			}
			case "key": {
				if (typeof body.key !== "string") return failure(400, "Say which key");
				return Response.json({ data: await browsers.press(thread, body.key) });
			}
			case "scroll": {
				const by = num("by");
				if (by === null) return failure(400, "Say how far to scroll");
				return Response.json({
					data: await browsers.scroll(thread, Math.max(-10_000, Math.min(10_000, by))),
				});
			}
			case "close":
				await browsers.close(thread);
				return new Response(null, { status: 204 });
			default:
				return failure(404, "Grid's browser cannot do that");
		}
	} catch (cause) {
		if (cause instanceof ChatError) return failure(cause.status, cause.message);
		if (cause instanceof BrowserError) return failure(cause.status, cause.message);
		throw cause;
	}
}

function failure(status: number, message: string): Response {
	return Response.json({ message }, { status });
}
