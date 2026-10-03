import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

/**
 * How this machine's runner behaves (Settings → Machines → Runner): whether Grid starts when the
 * person logs in, whether the machine stays awake while agents work, and how many agents may work
 * at the same time. Per machine, not per person or workspace.
 */
export type MachinePrefs = { keepAwake: boolean; concurrency: number };

export const DEFAULT_MACHINE_PREFS: MachinePrefs = { keepAwake: false, concurrency: 4 };
export const CONCURRENCY_CHOICES = [1, 2, 4] as const;

export class MachinePrefsStore {
	private readonly db: Database;

	constructor(path: string) {
		if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
		this.db = new Database(path, { create: true });
		this.db.exec("PRAGMA journal_mode = WAL");
		this.db.exec(`CREATE TABLE IF NOT EXISTS machine_prefs (
			id INTEGER PRIMARY KEY CHECK (id = 1),
			prefs TEXT NOT NULL
		)`);
	}

	get(): MachinePrefs {
		const row = this.db
			.query<{ prefs: string }, []>("SELECT prefs FROM machine_prefs WHERE id = 1")
			.get();
		if (!row) return { ...DEFAULT_MACHINE_PREFS };
		try {
			return { ...DEFAULT_MACHINE_PREFS, ...(JSON.parse(row.prefs) as Partial<MachinePrefs>) };
		} catch {
			return { ...DEFAULT_MACHINE_PREFS };
		}
	}

	set(prefs: MachinePrefs): MachinePrefs {
		this.db
			.query(
				"INSERT INTO machine_prefs (id, prefs) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET prefs = excluded.prefs",
			)
			.run(JSON.stringify(prefs));
		return this.get();
	}
}

/** Grid's checkout, whose `bun run grid` starts the whole of it. */
const ROOT = resolve(import.meta.dir, "../../../..");

/** Where the system looks for programs to start at login, per platform. */
export function autostartFile(platform = process.platform, home = homedir()): string | null {
	if (platform === "linux") return join(home, ".config", "autostart", "grid.desktop");
	if (platform === "darwin")
		return join(home, "Library", "LaunchAgents", "dev.grid.launcher.plist");
	return null;
}

/** What that file says: run `bun run grid` in Grid's checkout. */
export function autostartContent(platform: string, bun: string, root = ROOT): string {
	if (platform === "darwin")
		return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key><string>dev.grid.launcher</string>
	<key>ProgramArguments</key><array><string>${bun}</string><string>run</string><string>grid</string></array>
	<key>WorkingDirectory</key><string>${root}</string>
	<key>RunAtLoad</key><true/>
</dict>
</plist>
`;
	return `[Desktop Entry]
Type=Application
Name=Grid
Comment=Start Grid when you log in
Exec=sh -c 'cd "${root}" && "${bun}" run grid'
X-GNOME-Autostart-enabled=true
NoDisplay=true
`;
}

/** Whether Grid starts at login on this machine. */
export function startsAtLogin(): boolean {
	const file = autostartFile();
	return file !== null && existsSync(file);
}

/** Turn starting at login on or off; false when this system has no way to. */
export function setStartAtLogin(on: boolean): boolean {
	const file = autostartFile();
	if (!file) return false;
	if (!on) {
		rmSync(file, { force: true });
		return true;
	}
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, autostartContent(process.platform, process.execPath));
	return true;
}

/**
 * Keeps the machine from sleeping while any agent works: `systemd-inhibit` on Linux, `caffeinate`
 * on macOS, held while work is going and let go when it stops.
 */
export class KeepAwake {
	private held: ReturnType<typeof Bun.spawn> | null = null;
	enabled = false;

	update(running: number): void {
		const want = this.enabled && running > 0;
		if (want && !this.held) this.held = this.hold();
		else if (!want && this.held) {
			this.held.kill();
			this.held = null;
		}
	}

	private hold(): ReturnType<typeof Bun.spawn> | null {
		const command =
			process.platform === "darwin"
				? ["caffeinate", "-i"]
				: Bun.which("systemd-inhibit")
					? [
							"systemd-inhibit",
							"--what=idle:sleep",
							"--who=Grid",
							"--why=Agents are working",
							"sleep",
							"infinity",
						]
					: null;
		if (!command) return null;
		try {
			return Bun.spawn(command, { stdout: "ignore", stderr: "ignore" });
		} catch {
			return null;
		}
	}
}
