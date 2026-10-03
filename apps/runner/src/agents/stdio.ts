/** A child process that speaks newline-delimited JSON on stdin/stdout. */
export type JsonProcess = {
	send: (message: unknown) => void;
	kill: () => void;
	/** Resolves with the exit code when the process ends. */
	exited: Promise<number>;
};

export type Spawn = (
	command: string[],
	options: {
		cwd: string;
		/** Added to the runner's own environment (the person's git identity, say). */
		env?: Record<string, string>;
		onMessage: (message: unknown) => void;
		onStderr?: (text: string) => void;
	},
) => JsonProcess;

/** Real processes, via Bun. Tests pass a fake with the same shape. */
export const spawnJsonProcess: Spawn = (command, { cwd, env, onMessage, onStderr }) => {
	const proc = Bun.spawn(command, {
		cwd,
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
		env: { ...process.env, ...env, NO_COLOR: "1" },
	});

	void readLines(proc.stdout, (line) => {
		try {
			onMessage(JSON.parse(line));
		} catch {
			// Agents occasionally print a stray non-JSON line (a banner, a warning); skip it.
		}
	});
	void readLines(proc.stderr, (line) => onStderr?.(line));

	return {
		send: (message) => {
			proc.stdin.write(`${JSON.stringify(message)}\n`);
			proc.stdin.flush();
		},
		kill: () => proc.kill(),
		exited: proc.exited.then((code) => code ?? 0),
	};
};

async function readLines(stream: ReadableStream<Uint8Array>, onLine: (line: string) => void) {
	const decoder = new TextDecoder();
	let buffered = "";
	for await (const chunk of stream) {
		buffered += decoder.decode(chunk, { stream: true });
		let newline = buffered.indexOf("\n");
		while (newline >= 0) {
			const line = buffered.slice(0, newline).trim();
			buffered = buffered.slice(newline + 1);
			if (line) onLine(line);
			newline = buffered.indexOf("\n");
		}
	}
	if (buffered.trim()) onLine(buffered.trim());
}

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };

/**
 * JSON-RPC 2.0 over a `JsonProcess`, both ways: our requests to the agent, and the agent's
 * requests to us (ACP asks the client for permissions this way).
 */
export class JsonRpc {
	private nextId = 1;
	private readonly pending = new Map<number, Pending>();

	constructor(
		private readonly process: JsonProcess,
		private readonly handlers: {
			onNotification: (method: string, params: unknown) => void;
			onRequest: (method: string, params: unknown, respond: (result: unknown) => void) => void;
		},
	) {}

	/** Feed every message the process prints to this. */
	receive(message: unknown): void {
		const rpc = message as {
			id?: number | string;
			method?: string;
			params?: unknown;
			result?: unknown;
			error?: { message?: string };
		};
		if (rpc.method !== undefined && rpc.id !== undefined) {
			this.handlers.onRequest(rpc.method, rpc.params, (result) =>
				this.process.send({ jsonrpc: "2.0", id: rpc.id, result }),
			);
		} else if (rpc.method !== undefined) {
			this.handlers.onNotification(rpc.method, rpc.params);
		} else if (typeof rpc.id === "number") {
			const waiting = this.pending.get(rpc.id);
			this.pending.delete(rpc.id);
			if (!waiting) return;
			if (rpc.error) waiting.reject(new Error(rpc.error.message ?? "The agent returned an error"));
			else waiting.resolve(rpc.result);
		}
	}

	request<T = unknown>(method: string, params: unknown): Promise<T> {
		const id = this.nextId++;
		return new Promise<T>((resolve, reject) => {
			this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
			this.process.send({ jsonrpc: "2.0", id, method, params });
		});
	}

	notify(method: string, params: unknown): void {
		this.process.send({ jsonrpc: "2.0", method, params });
	}

	/** Fail everything still waiting, e.g. when the process died. */
	failAll(reason: string): void {
		for (const waiting of this.pending.values()) waiting.reject(new Error(reason));
		this.pending.clear();
	}
}
