import type { Choice } from "./events";

/**
 * Keep an expensive lookup (spawning a CLI to list its models) for a while, sharing one run.
 * `fresh` skips the kept value, for an explicit refresh.
 */
export function cached<T>(ttlMs: number, load: () => Promise<T>): (fresh?: boolean) => Promise<T> {
	let value: { at: number; data: T } | null = null;
	let pending: Promise<T> | null = null;
	return (fresh = false) => {
		if (!fresh && value && Date.now() - value.at < ttlMs) return Promise.resolve(value.data);
		pending ??= load()
			.then((data) => {
				value = { at: Date.now(), data };
				return data;
			})
			.finally(() => {
				pending = null;
			});
		return pending;
	};
}

const EFFORT_NAMES: Record<string, string> = {
	none: "None",
	minimal: "Minimal",
	low: "Low",
	medium: "Medium",
	high: "High",
	xhigh: "Extra high",
	max: "Max",
	ultra: "Ultra",
};

const EFFORT_ORDER = ["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"];

/** Effort levels as choices, in their natural order, with readable names. */
export function effortChoices(levels: string[]): Choice[] {
	return [...new Set(levels)]
		.sort((a, b) => {
			const ai = EFFORT_ORDER.indexOf(a);
			const bi = EFFORT_ORDER.indexOf(b);
			return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
		})
		.map((level) => ({
			id: level,
			name: EFFORT_NAMES[level] ?? level.charAt(0).toUpperCase() + level.slice(1),
		}));
}

/** Run a CLI and return what it printed, or throw with what it said on stderr. */
export async function runCli(command: string[], timeoutMs = 20_000): Promise<string> {
	const proc = Bun.spawn(command, {
		stdin: "ignore",
		stdout: "pipe",
		stderr: "pipe",
		env: { ...process.env, NO_COLOR: "1" },
	});
	const timer = setTimeout(() => proc.kill(), timeoutMs);
	const [out, err, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	clearTimeout(timer);
	if (code !== 0) throw new Error(`${command[0]} failed (${code}): ${err.trim().slice(-300)}`);
	return out;
}
