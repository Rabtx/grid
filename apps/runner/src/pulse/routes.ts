import type { Who } from "../auth";
import { may, NOT_ALLOWED } from "../permissions";
import { type Pulse, PulseError } from "./service";

function failure(status: number, message: string): Response {
	return Response.json({ message }, { status });
}

/**
 * Home → Pulse over HTTP: `GET /pulse?days=30` (the numbers for a period) and `POST
 * /pulse/refresh` (`{ days }`: read them again now). Reading is everyone's; asking an agent to read
 * them takes a role that may start agents.
 */
export async function pulseRequest(
	request: Request,
	url: URL,
	who: Who,
	pulse: Pulse,
): Promise<Response | null> {
	if (url.pathname !== "/pulse" && url.pathname !== "/pulse/refresh") return null;
	try {
		if (url.pathname === "/pulse" && request.method === "GET") {
			const days = Number(url.searchParams.get("days") ?? 30);
			return Response.json({ data: await pulse.view(who, days) });
		}
		if (url.pathname === "/pulse/refresh" && request.method === "POST") {
			if (!may(who, "startAgents")) return failure(403, NOT_ALLOWED);
			const body = (await request.json().catch(() => ({}))) as { days?: unknown };
			const days = typeof body.days === "number" ? body.days : 30;
			// The reading takes minutes: started here, watched through GET /pulse.
			void pulse.refresh(who, days).catch(() => undefined);
			return Response.json({ data: { reading: true } }, { status: 202 });
		}
		return failure(405, "Not allowed");
	} catch (cause) {
		if (cause instanceof PulseError) return failure(cause.status, cause.message);
		throw cause;
	}
}
