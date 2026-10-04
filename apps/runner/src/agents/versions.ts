import { runCli } from "./catalog";

/** How long an agent's version is trusted before it is asked again (an update can change it). */
const KEEP_MS = 10 * 60_000;

const known = new Map<string, { version: string | null; until: number }>();

/** "v2.1.4" from whatever `--version` printed, or null when it printed nothing like one. */
export function parseVersion(output: string): string | null {
	const match = /\bv?(\d+\.\d+(?:\.\d+)?)/.exec(output);
	return match ? `v${match[1]}` : null;
}

/** An installed agent's version (`<binary> --version`), kept a while; null when it will not say. */
export async function agentVersion(binary: string | null): Promise<string | null> {
	if (!binary) return null;
	const kept = known.get(binary);
	if (kept && kept.until > Date.now()) return kept.version;
	let version: string | null = null;
	try {
		version = parseVersion(await runCli([binary, "--version"], 5_000));
	} catch {
		version = null;
	}
	known.set(binary, { version, until: Date.now() + KEEP_MS });
	return version;
}
