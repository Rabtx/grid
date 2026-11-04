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
			// One decoder per stream, and it keeps partial characters between reads: the device
			// code and the paste-back text are typed by hand, and a character split across two
			// chunks decoded without `stream` came out mangled. Sharing one decoder across both
			// streams spliced their bytes together instead.
			for (const stream of [child.stdout, child.stderr]) {
				const decoder = new TextDecoder();
				void (async () => {
					for await (const chunk of stream as ReadableStream<Uint8Array>) {
						const text = decoder.decode(chunk, { stream: true });
						for (const listener of listeners) listener(text);
					}
					const rest = decoder.decode();
					if (rest) for (const listener of listeners) listener(rest);
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

/** A GitHub CLI release asset, as GitHub's releases API lists it. */
type ReleaseAsset = { name: string; browser_download_url: string };

/**
 * The release archive for this machine: `gh_<version>_linux_amd64.tar.gz`, `gh_<version>_macOS_arm64.zip`
 * and the like; null where GitHub publishes none for it (Windows takes the MSI installer).
 */
export function ghAsset(
	release: { tag_name: string; assets: readonly ReleaseAsset[] },
	platform: string = process.platform,
	arch: string = process.arch,
): ReleaseAsset | null {
	const os = platform === "linux" ? "linux" : platform === "darwin" ? "macOS" : null;
	const cpu = arch === "x64" ? "amd64" : arch === "arm64" ? "arm64" : null;
	if (!os || !cpu) return null;
	const version = release.tag_name.replace(/^v/, "");
	const name = `gh_${version}_${os}_${cpu}${os === "linux" ? ".tar.gz" : ".zip"}`;
	return release.assets.find((asset) => asset.name === name) ?? null;
}

/**
 * Install the GitHub CLI without a terminal or root: GitHub's own latest release for this machine,
 * unpacked into `~/.local/bin`, where the runner already looks for programs (`withAgentBins`).
 * Throws with what went wrong, for the person to read.
 */
export async function installGh(home: string, fetchImpl: typeof fetch = fetch): Promise<void> {
	const { join } = await import("node:path");
	const { mkdir, mkdtemp, copyFile, chmod, rm } = await import("node:fs/promises");
	const { tmpdir } = await import("node:os");
	const latest = await fetchImpl("https://api.github.com/repos/cli/cli/releases/latest", {
		headers: { accept: "application/vnd.github+json", "user-agent": "grid-runner" },
	});
	if (!latest.ok) throw new Error(`GitHub did not list the CLI's releases (${latest.status})`);
	const release = (await latest.json()) as { tag_name: string; assets: ReleaseAsset[] };
	const asset = ghAsset(release);
	if (!asset)
		throw new Error(`There is no GitHub CLI download for ${process.platform} on ${process.arch}`);
	const archive = await fetchImpl(asset.browser_download_url);
	if (!archive.ok) throw new Error(`Could not download the GitHub CLI (${archive.status})`);
	const work = await mkdtemp(join(tmpdir(), "grid-gh-"));
	try {
		const file = join(work, asset.name);
		await Bun.write(file, archive);
		const unpack = asset.name.endsWith(".zip")
			? ["unzip", "-q", file, "-d", work]
			: ["tar", "-xzf", file, "-C", work];
		const code = await Bun.spawn(unpack, { stdout: "ignore", stderr: "ignore" }).exited;
		if (code !== 0) throw new Error("Could not unpack the GitHub CLI download");
		const folder = asset.name.replace(/\.(tar\.gz|zip)$/, "");
		const bin = join(home, ".local", "bin");
		await mkdir(bin, { recursive: true });
		await copyFile(join(work, folder, "bin", "gh"), join(bin, "gh"));
		await chmod(join(bin, "gh"), 0o755);
	} finally {
		await rm(work, { recursive: true, force: true });
	}
}
