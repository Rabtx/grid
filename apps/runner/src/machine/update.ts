import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

/** Where an update run is up to, as `scripts/bash/update-grid.sh` writes it. */
export type UpdateRun = {
	state: "running" | "done" | "failed";
	step: string;
	startedAt: string;
	finishedAt: string;
	/** Short commits: what Grid ran before, and what it updates to (once fetched). */
	from: string;
	to: string;
	message: string;
};

export type UpdateStatus = {
	/** Whether this machine can update itself from Grid (a systemd user service, a checkout). */
	available: boolean;
	/** Why not, when it cannot. */
	reason: string | null;
	current: { commit: string; subject: string } | null;
	/** Commits on origin/main this checkout has not got, when last checked. */
	behind: number | null;
	last: UpdateRun | null;
};

type Run = (cmd: string[], cwd: string) => { ok: boolean; out: string };

export type UpdaterOptions = {
	/** The checkout Grid runs from. */
	root?: string;
	statusFile?: string;
	env?: Record<string, string | undefined>;
	run?: Run;
	/** Starts the update in the background, outside this service's processes. */
	launch?: (cmd: string[]) => void;
	which?: (bin: string) => string | null;
	now?: () => number;
};

/** An update still says "running" after this long only because it died without saying so. */
const STALE_MS = 30 * 60_000;

const run: Run = (cmd, cwd) => {
	const result = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
	return { ok: result.exitCode === 0, out: result.stdout.toString().trim() };
};

/**
 * Updates the checkout Grid runs from and restarts its services, from Settings → Machines. The work
 * is `scripts/bash/update-grid.sh`, started with `systemd-run --user` so it is not one of this
 * service's processes: restarting the service at the end would otherwise stop the update too.
 */
export class GridUpdater {
	private readonly root: string;
	private readonly statusFile: string;
	private readonly env: Record<string, string | undefined>;
	private readonly run: Run;
	private readonly launch: (cmd: string[]) => void;
	private readonly which: (bin: string) => string | null;
	private readonly now: () => number;
	private behind: number | null = null;

	constructor(options: UpdaterOptions = {}) {
		this.root = options.root ?? resolve(import.meta.dir, "../../../..");
		this.env = options.env ?? process.env;
		const data = this.env.XDG_DATA_HOME ?? join(this.env.HOME ?? homedir(), ".local", "share");
		this.statusFile = options.statusFile ?? join(data, "grid", "update-status.json");
		this.run = options.run ?? run;
		this.launch =
			options.launch ??
			((cmd) => {
				Bun.spawn(cmd, { stdio: ["ignore", "ignore", "ignore"] }).unref();
			});
		this.which = options.which ?? ((bin) => Bun.which(bin));
		this.now = options.now ?? Date.now;
	}

	private get script(): string {
		return join(this.root, "scripts", "bash", "update-grid.sh");
	}

	/** Why this machine cannot update itself from Grid, or null when it can. */
	private unavailable(): string | null {
		if (!this.env.INVOCATION_ID) return "Grid is not running as a systemd service on this machine";
		if (!this.which("systemd-run")) return "systemd-run is not available on this machine";
		if (!existsSync(this.script) || !existsSync(join(this.root, ".git")))
			return "Grid is not running from a git checkout";
		return null;
	}

	private last(): UpdateRun | null {
		if (!existsSync(this.statusFile)) return null;
		try {
			const run = JSON.parse(readFileSync(this.statusFile, "utf8")) as UpdateRun;
			// Started and never heard from again (the machine went down mid-build, say).
			if (run.state === "running" && this.now() - Date.parse(run.startedAt) > STALE_MS)
				return { ...run, state: "failed", message: "The update stopped without finishing" };
			return run;
		} catch (cause) {
			console.error("[runner] could not read the update status", cause);
			return null;
		}
	}

	status(): UpdateStatus {
		const reason = this.unavailable();
		const head = existsSync(join(this.root, ".git"))
			? this.run(["git", "log", "-1", "--format=%h%x09%s"], this.root)
			: { ok: false, out: "" };
		const [commit = "", subject = ""] = head.out.split("\t");
		return {
			available: reason === null,
			reason,
			current: head.ok ? { commit, subject } : null,
			behind: this.behind,
			last: this.last(),
		};
	}

	/** Fetches origin/main and counts the commits this checkout has not got. */
	check(): UpdateStatus {
		const fetched = this.run(["git", "fetch", "--quiet", "origin", "main"], this.root);
		if (fetched.ok) {
			const count = this.run(["git", "rev-list", "--count", "HEAD..origin/main"], this.root);
			this.behind = count.ok ? Number(count.out) || 0 : null;
		}
		return this.status();
	}

	/** Starts an update; false when one is already running. */
	start(): boolean {
		const reason = this.unavailable();
		if (reason) throw new Error(reason);
		if (this.last()?.state === "running") return false;
		const startedAt = new Date(this.now()).toISOString();
		// Marked running at once, so a second press does not start another before the script writes.
		const marked: UpdateRun = {
			state: "running",
			step: "starting",
			startedAt,
			finishedAt: "",
			from: this.status().current?.commit ?? "",
			to: "",
			message: "",
		};
		mkdirSync(dirname(this.statusFile), { recursive: true });
		writeFileSync(this.statusFile, `${JSON.stringify(marked)}\n`);
		const env = ["PATH", "HOME", "XDG_DATA_HOME", "GRID_UPDATE_UNITS"].flatMap((name) =>
			this.env[name] ? [`--setenv=${name}=${this.env[name]}`] : [],
		);
		this.launch([
			"systemd-run",
			"--user",
			`--unit=grid-update-${this.now()}`,
			"--collect",
			"--quiet",
			`--setenv=GRID_UPDATE_STATUS=${this.statusFile}`,
			...env,
			"bash",
			this.script,
		]);
		this.behind = null;
		return true;
	}
}
