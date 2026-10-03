import { readFileSync } from "node:fs";
import { statfs } from "node:fs/promises";
import os from "node:os";

/** This machine as Settings → Machines shows it: what it is, and how hard it is working. */
export type MachineInfo = {
	hostname: string;
	/** "Linux 7.2", "macOS 15", "Windows 11". */
	system: string;
	cpu: string;
	cores: number;
	memory: { totalBytes: number; usedBytes: number };
	/** How busy the processors were over a short sample, 0–100. */
	cpuPercent: number;
	/** The disk the projects live on. */
	disk: { totalBytes: number; freeBytes: number };
	runnerVersion: string;
	/** When this runner started. */
	startedAt: string;
};

/** "macOS 15" from Darwin 24, "Linux 7.2" from the kernel release. */
export function systemName(platform: string, release: string): string {
	const major = Number(release.split(".")[0]);
	if (platform === "darwin") return `macOS ${Number.isFinite(major) ? major - 9 : release}`;
	if (platform === "win32") return "Windows";
	if (platform === "linux") return `Linux ${release.split(".").slice(0, 2).join(".")}`;
	return platform;
}

/** Memory in use: total less what Linux says is available (caches count as free), else free. */
function memoryUsed(): number {
	const total = os.totalmem();
	try {
		const available = /MemAvailable:\s+(\d+)\s+kB/.exec(readFileSync("/proc/meminfo", "utf8"));
		if (available) return total - Number(available[1]) * 1024;
	} catch {
		// Not Linux: free memory is the best there is.
	}
	return total - os.freemem();
}

function cpuTimes(): { idle: number; total: number } {
	let idle = 0;
	let total = 0;
	for (const cpu of os.cpus()) {
		const times = cpu.times;
		idle += times.idle;
		total += times.user + times.nice + times.sys + times.idle + times.irq;
	}
	return { idle, total };
}

/** How busy the processors are, sampled over `ms`. */
async function cpuPercent(ms = 200): Promise<number> {
	const first = cpuTimes();
	await Bun.sleep(ms);
	const second = cpuTimes();
	const total = second.total - first.total;
	if (total <= 0) return 0;
	return Math.round(100 * (1 - (second.idle - first.idle) / total));
}

let runnerVersion: string | null = null;
function version(): string {
	if (runnerVersion) return runnerVersion;
	try {
		const pkg = JSON.parse(
			readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
		) as { version?: string };
		runnerVersion = `v${pkg.version ?? "0"}`;
	} catch {
		runnerVersion = "v0";
	}
	return runnerVersion;
}

export async function machineInfo(projectsDir: string, startedAt: number): Promise<MachineInfo> {
	const [percent, disk] = await Promise.all([cpuPercent(), statfs(projectsDir).catch(() => null)]);
	return {
		hostname: os.hostname(),
		system: systemName(process.platform, os.release()),
		cpu: os.cpus()[0]?.model.replace(/\s+/g, " ").trim() ?? "Unknown processor",
		cores: os.cpus().length,
		memory: { totalBytes: os.totalmem(), usedBytes: memoryUsed() },
		cpuPercent: percent,
		disk: disk
			? { totalBytes: disk.blocks * disk.bsize, freeBytes: disk.bavail * disk.bsize }
			: { totalBytes: 0, freeBytes: 0 },
		runnerVersion: version(),
		startedAt: new Date(startedAt).toISOString(),
	};
}
