import { isPushEndpoint, type PushNotifier } from "./notifier";

// The contact a push service may use for this Grid when the console is not served over https.
const FALLBACK_SUBJECT = "mailto:owner@grid.local";

/**
 * Push over HTTP: the key a browser subscribes with, and adding or removing a device. Returns
 * null for paths it does not own, so the server can try its other routes.
 */
export async function pushRequest(
	request: Request,
	url: URL,
	userId: string,
	push: PushNotifier,
): Promise<Response | null> {
	if (url.pathname === "/push/key" && request.method === "GET") {
		return Response.json({
			data: { publicKey: await push.publicKey(), devices: push.count(userId) },
		});
	}
	if (url.pathname === "/push/test" && request.method === "POST") {
		if (push.count(userId) === 0) return failure(409, "Turn notifications on first");
		const sent = await push.notify(userId, {
			title: "Grid",
			body: "Notifications work. You'll hear from agents here.",
			url: "/settings/agents",
			tag: "grid-test",
		});
		return sent > 0
			? new Response(null, { status: 204 })
			: failure(
					502,
					"The push service turned the notification down. Turn notifications off and on.",
				);
	}
	if (url.pathname !== "/push/subscriptions") return null;

	const body = (await request.json().catch(() => null)) as {
		endpoint?: unknown;
		keys?: { p256dh?: unknown; auth?: unknown };
	} | null;
	const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
	if (!isPushEndpoint(endpoint)) {
		const host = hostOf(endpoint);
		console.warn(`[runner] refused a push subscription for ${host}`);
		return failure(
			400,
			`Your browser's push service (${host}) is not one Grid knows yet. Tell us the name so it can be added.`,
		);
	}

	if (request.method === "DELETE") {
		push.unsubscribe(userId, endpoint);
		return new Response(null, { status: 204 });
	}
	if (request.method !== "POST") return failure(405, "Method not allowed");

	const p256dh = body?.keys?.p256dh;
	const auth = body?.keys?.auth;
	if (typeof p256dh !== "string" || typeof auth !== "string" || !p256dh || !auth) {
		return failure(400, "Send the subscription's keys");
	}
	const origin = request.headers.get("origin") ?? "";
	push.subscribe(
		userId,
		{ endpoint, p256dh, auth },
		origin.startsWith("https://") ? origin : FALLBACK_SUBJECT,
	);
	return new Response(null, { status: 204 });
}

function hostOf(endpoint: string): string {
	try {
		return new URL(endpoint).host || "no address";
	} catch {
		return "no address";
	}
}

function failure(status: number, message: string): Response {
	return Response.json({ message }, { status });
}
