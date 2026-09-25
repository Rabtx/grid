/**
 * The GitHub CLI, run by the runner. `gh` signs in with GitHub's own device flow and keeps the
 * credential in its keyring, so Grid registers no GitHub app and never stores a GitHub token.
 */

export type GhResult = { code: number; stdout: string; stderr: string };

export type Gh = {
	/** Run `gh` to the end. */
	run: (args: string[], options?: { timeoutMs?: number }) => Promise<GhResult>;
	/**
	 * Start `gh` and keep it running (a sign-in waits for the person on github.com): its output
	 * as it arrives, and its exit code once done.
	 */
	spawn: (args: string[]) => {
		output: (listener: (text: string) => void) => void;
		exited: Promise<number>;
		kill: () => void;
	};
};

// No prompts, no update checks, and no browser opened on the machine Grid runs on: the person
// opens the sign-in page on whatever device they are using.
const QUIET = { GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1", BROWSER: "true" };

export function createGh(binary = "gh"): Gh {
	const env = { ...process.env, ...QUIET };
	return {
		async run(args, options = {}) {
			let child: ReturnType<typeof Bun.spawn>;
			try {
				child = Bun.spawn([binary, ...args], {
					env,
					stdout: "pipe",
					stderr: "pipe",
					stdin: "ignore",
				});
			} catch {
				return { code: 127, stdout: "", stderr: "gh is not installed" };
			}
			const timer = setTimeout(() => child.kill(), options.timeoutMs ?? 60_000);
			const [stdout, stderr, code] = await Promise.all([
				new Response(child.stdout as ReadableStream).text(),
				new Response(child.stderr as ReadableStream).text(),
				child.exited,
			]);
			clearTimeout(timer);
			return { code, stdout, stderr };
		},
		spawn(args) {
			const listeners: ((text: string) => void)[] = [];
			const child = Bun.spawn([binary, ...args], {
				env,
				stdout: "pipe",
				stderr: "pipe",
				stdin: "pipe",
			});
			// `gh auth login --web` asks for Enter before it starts waiting; there is no one to press it.
			child.stdin.write("\n");
			child.stdin.flush();
			const decoder = new TextDecoder();
			for (const stream of [child.stdout, child.stderr]) {
				void (async () => {
					for await (const chunk of stream as ReadableStream<Uint8Array>) {
						const text = decoder.decode(chunk);
						for (const listener of listeners) listener(text);
					}
				})();
			}
			return {
				output: (listener) => listeners.push(listener),
				exited: child.exited,
				kill: () => child.kill(),
			};
		},
	};
}
