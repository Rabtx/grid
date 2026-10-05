import type { Who } from "../auth";
import { type Operate, OperateError } from "./service";

const failure = (status: number, message: string) => Response.json({ message }, { status });

export async function operateRequest(
	request: Request,
	url: URL,
	who: Who,
	operate: Operate,
): Promise<Response | null> {
	const match = url.pathname.match(/^\/operate\/([a-z0-9-]+)(?:\/services\/([^/]+))?$/);
	if (!match) return url.pathname.startsWith("/operate") ? failure(404, "Not found") : null;
	const [, project = "", rawName] = match;
	let name: string;
	try {
		name = rawName ? decodeURIComponent(rawName) : "";
	} catch {
		return failure(400, "Bad service name");
	}
	try {
		if (!rawName && request.method === "GET")
			return Response.json({ data: operate.view(who, project) });
		if (rawName && request.method === "DELETE") {
			operate.remove(who, project, name);
			return new Response(null, { status: 204 });
		}
		if (rawName && request.method === "PUT") {
			if (Number(request.headers.get("content-length")) > 4_096)
				return failure(413, "The request is too large");
			const reader = request.body?.getReader();
			let body = "";
			if (reader) {
				const decoder = new TextDecoder();
				let size = 0;
				for (;;) {
					const { done, value } = await reader.read();
					if (done) break;
					size += value.byteLength;
					if (size > 4_096) {
						await reader.cancel();
						return failure(413, "The request is too large");
					}
					body += decoder.decode(value, { stream: true });
				}
				body += decoder.decode();
			}
			let parsed: unknown;
			try {
				parsed = JSON.parse(body);
			} catch {
				return failure(400, "Give a service address");
			}
			if (
				typeof parsed !== "object" ||
				parsed === null ||
				!("url" in parsed) ||
				typeof parsed.url !== "string"
			)
				return failure(400, "Give a service address");
			operate.register(who, project, name, parsed.url);
			return new Response(null, { status: 204 });
		}
		return failure(405, "Not allowed");
	} catch (cause) {
		if (cause instanceof OperateError) return failure(cause.status, cause.message);
		throw cause;
	}
}
