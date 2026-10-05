import type { Who } from "../auth";
import { OperateError } from "./service";
import type { OperateTelemetry } from "./telemetry";

async function body(request: Request): Promise<unknown> {
	if (Number(request.headers.get("content-length")) > 4_096)
		throw new OperateError("The request is too large", 413);
	const reader = request.body?.getReader();
	if (!reader) throw new OperateError("Give a JSON request body");
	const chunks: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > 4_096) {
			await reader.cancel();
			throw new OperateError("The request is too large", 413);
		}
		chunks.push(value);
	}
	try {
		return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
	} catch {
		throw new OperateError("Give a JSON request body");
	}
}
export async function telemetryRequest(
	request: Request,
	url: URL,
	who: Who,
	telemetry: OperateTelemetry,
): Promise<Response | null> {
	const match = url.pathname.match(
		/^\/operate\/([a-z0-9-]+)\/(logs|costs)(?:\/([^/]+))?(?:\/([^/]+))?$/,
	);
	if (!match) return null;
	const [, project = "", section, rawName, rawId] = match;
	try {
		const name = rawName ? decodeURIComponent(rawName) : "";
		const id = rawId ? decodeURIComponent(rawId) : "";
		if (section === "logs" && !rawId) {
			if (request.method === "GET")
				return Response.json({
					data: rawName ? telemetry.tail(who, project, name) : telemetry.logs(who, project),
				});
			if (rawName && request.method === "PUT") {
				const parsed = await body(request);
				if (
					typeof parsed !== "object" ||
					parsed === null ||
					!("path" in parsed) ||
					typeof parsed.path !== "string"
				)
					throw new OperateError("Give a project-relative log path");
				telemetry.register(who, project, name, parsed.path);
				return new Response(null, { status: 204 });
			}
			if (rawName && request.method === "DELETE") {
				telemetry.removeSource(who, project, name);
				return new Response(null, { status: 204 });
			}
		} else if (section === "costs") {
			if (!rawName && request.method === "GET")
				return Response.json({ data: telemetry.costs(who, project) });
			if (name === "charges" && !rawId && request.method === "POST")
				return Response.json(
					{ data: telemetry.addCharge(who, project, await body(request)) },
					{ status: 201 },
				);
			if (name === "charges" && rawId && request.method === "DELETE") {
				telemetry.removeCharge(who, project, id);
				return new Response(null, { status: 204 });
			}
		}
		return Response.json({ message: "Not allowed" }, { status: 405 });
	} catch (cause) {
		if (cause instanceof OperateError)
			return Response.json({ message: cause.message }, { status: cause.status });
		if (cause instanceof URIError)
			return Response.json({ message: "Bad resource name" }, { status: 400 });
		throw cause;
	}
}
