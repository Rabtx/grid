import type { Who } from "../auth";
import { ACCOUNT_ENV, AccountError, type Accounts } from "./accounts";

/**
 * A person's provider accounts over HTTP: listing them with what each has used, adding one,
 * renaming and removing one. Signing in opens a terminal, so it lives with the terminals in the
 * server. Null for paths it does not own.
 */
export async function accountRequest(
	request: Request,
	url: URL,
	who: Who,
	accounts: Accounts,
): Promise<Response | null> {
	if (!url.pathname.startsWith("/chat/accounts")) return null;
	const owner = who.userId;
	try {
		if (url.pathname === "/chat/accounts" && request.method === "GET") {
			return Response.json({
				data: {
					supported: Object.keys(ACCOUNT_ENV),
					accounts: accounts.list(owner),
					usage: accounts.usage(owner),
				},
			});
		}
		if (url.pathname === "/chat/accounts" && request.method === "POST") {
			const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
			if (typeof body.provider !== "string" || typeof body.label !== "string")
				return failure(400, "Say which agent and what to call the account");
			return Response.json(
				{ data: accounts.create(owner, body.provider, body.label) },
				{ status: 201 },
			);
		}
		const one = url.pathname.match(/^\/chat\/accounts\/([\w-]+)$/);
		if (one && request.method === "PATCH") {
			const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
			if (typeof body.label !== "string") return failure(400, "Say what to call the account");
			return Response.json({ data: accounts.rename(owner, one[1] ?? "", body.label) });
		}
		if (one && request.method === "DELETE") {
			accounts.remove(owner, one[1] ?? "");
			return new Response(null, { status: 204 });
		}
		return null;
	} catch (cause) {
		if (cause instanceof AccountError) return failure(cause.status, cause.message);
		throw cause;
	}
}

function failure(status: number, message: string): Response {
	return Response.json({ message }, { status });
}
