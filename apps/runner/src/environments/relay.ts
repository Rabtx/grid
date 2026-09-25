/**
 * Carrying the console's calls to an environment's runner. The console talks to this (home)
 * runner as always, under `/env/<id>/…`; the home runner checks the person's session itself and
 * presents the environment's pairing token instead, so the session never leaves home.
 */

/** What the console may reach on an environment: its terminals, agents and folders. */
// `link` is here so the console can tell whether an environment has the link (426) or not (404).
const RELAYED_HTTP = /^\/(terminals|chat|fs|projects|transcribe|link)(\/|$)/;
export const RELAYED_SOCKETS = new Set(["/terminal", "/chat", "/link"]);

const CLOSE_NOT_FOUND = 4404;

export type RelayTarget = { url: string; token: string };

/** Forward one HTTP call, keeping only the headers the runner reads. */
export async function relayHttp(
	request: Request,
	path: string,
	search: string,
	target: RelayTarget,
	fetcher: typeof fetch = fetch,
): Promise<Response> {
	if (!RELAYED_HTTP.test(path)) return Response.json({ message: "Not found" }, { status: 404 });
	const headers: Record<string, string> = { Authorization: `Bearer ${target.token}` };
	for (const name of ["content-type", "accept"]) {
		const value = request.headers.get(name);
		if (value) headers[name] = value;
	}
	try {
		const response = await fetcher(`${target.url}${path}${search}`, {
			method: request.method,
			headers,
			body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
			redirect: "error",
		});
		return new Response(response.body, {
			status: response.status,
			headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
		});
	} catch {
		return Response.json(
			{ message: "The environment is not reachable right now." },
			{ status: 502 },
		);
	}
}

type Outgoing = string | ArrayBuffer | Uint8Array;

/**
 * One console socket carried through to an environment's socket. Created on the console's
 * hello (already checked here), it opens the environment's socket, says hello there with the
 * pairing token, and then passes frames both ways untouched. Either end closing closes the other.
 */
export class SocketRelay {
	private remote: WebSocket | null = null;
	private queue: Outgoing[] = [];
	private closed = false;

	constructor(
		private readonly client: {
			send: (data: string | ArrayBuffer | Uint8Array) => void;
			close: (code?: number, reason?: string) => void;
		},
		private readonly createSocket: (url: string) => WebSocket = (url) => new WebSocket(url),
	) {}

	open(target: RelayTarget, path: string, hello: Record<string, unknown>): void {
		const url = `${target.url.replace(/^http/, "ws")}${path}`;
		const remote = this.createSocket(url);
		remote.binaryType = "arraybuffer";
		this.remote = remote;
		remote.addEventListener("open", () => {
			remote.send(JSON.stringify({ ...hello, token: target.token }));
			for (const frame of this.queue) remote.send(frame);
			this.queue = [];
		});
		remote.addEventListener("message", (event: MessageEvent) => {
			if (!this.closed) this.client.send(event.data as string | ArrayBuffer);
		});
		remote.addEventListener("close", (event: CloseEvent) => {
			if (this.closed) return;
			this.closed = true;
			// The environment turning our token away means the pairing is gone, not the sign-in:
			// telling the console to sign in again would only loop.
			const code = event.code === 4401 ? CLOSE_NOT_FOUND : event.code;
			const reason =
				event.code === 4401
					? "The environment no longer knows this Grid; pair it again"
					: event.reason;
			this.client.close(code >= 4000 ? code : 1011, reason || "The environment closed the link");
		});
		remote.addEventListener("error", () => {
			// A close event follows; that is where the console is told.
		});
	}

	forward(frame: Outgoing): void {
		if (this.closed) return;
		if (this.remote?.readyState === WebSocket.OPEN) this.remote.send(frame);
		else if (this.queue.length < 256) this.queue.push(frame);
	}

	close(): void {
		this.closed = true;
		this.remote?.close();
		this.remote = null;
	}
}
