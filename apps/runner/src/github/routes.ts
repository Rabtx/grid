import { type CodespacesLink, GitHubError } from "./codespaces";

/**
 * GitHub over HTTP: the sign-in (`/github`), and the person's Codespaces
 * (`/github/codespaces…`). Returns null for paths it does not own.
 */
export async function githubRequest(
	request: Request,
	url: URL,
	userId: string,
	github: CodespacesLink,
): Promise<Response | null> {
	try {
		if (url.pathname === "/github" && request.method === "GET") {
			return Response.json({ data: await github.status(userId) });
		}
		if (url.pathname === "/github/sign-in" && request.method === "POST") {
			return Response.json({ data: await github.signIn(userId) });
		}
		if (url.pathname === "/github" && request.method === "DELETE") {
			github.signOut(userId);
			return new Response(null, { status: 204 });
		}
		if (url.pathname === "/github/codespaces" && request.method === "GET") {
			return Response.json({ data: await github.list(userId) });
		}
		if (url.pathname === "/github/codespaces" && request.method === "POST") {
			const body = (await request.json().catch(() => null)) as {
				repository?: unknown;
				branch?: unknown;
			} | null;
			if (typeof body?.repository !== "string") return failure(400, "Say which repository");
			const name = await github.create(userId, {
				repository: body.repository.trim(),
				branch:
					typeof body.branch === "string" && body.branch.trim() ? body.branch.trim() : undefined,
			});
			return Response.json({ data: { name } }, { status: 201 });
		}
		const action = url.pathname.match(/^\/github\/codespaces\/([\w-]+)\/(start|stop|connect)$/);
		if (action && request.method === "POST") {
			const [, name, verb] = action;
			if (verb === "start") await github.start(userId, name);
			else if (verb === "stop") await github.stop(userId, name);
			else github.connect(userId, name);
			return new Response(null, { status: verb === "connect" ? 202 : 204 });
		}
		return url.pathname.startsWith("/github") ? failure(404, "Not found") : null;
	} catch (cause) {
		if (cause instanceof GitHubError) return failure(cause.status, cause.message);
		throw cause;
	}
}

function failure(status: number, message: string): Response {
	return Response.json({ message }, { status });
}
