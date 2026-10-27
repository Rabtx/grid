import type { Sandboxes } from "./sandbox";

/**
 * Whether threads can run in a sandbox on this machine (Settings → Machines, and the composer's
 * sandbox switch): Docker, the image they would use, and whether it is here yet.
 *
 *   GET /sandbox            (`?fresh=1` asks Docker again now)
 */
export function sandboxRequest(request: Request, url: URL, sandboxes: Sandboxes): Response | null {
	if (url.pathname !== "/sandbox") return null;
	if (request.method !== "GET") return Response.json({ message: "Use GET" }, { status: 405 });
	return Response.json({ data: sandboxes.status(url.searchParams.get("fresh") === "1") });
}
