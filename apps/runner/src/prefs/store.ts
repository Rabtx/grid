import type { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { openPrivateDatabase } from "../private-database";

/**
 * What a person sets for themselves on this runner (Figma 24 · Settings → Profile and
 * Notifications): who their agents' commits are by, and when and where Grid may reach them. Kept
 * per person, not per workspace, like their agent settings and devices.
 */

/** Who agents commit as, and how. */
export type GitPrefs = {
	/** The name and email commits carry; null until the person's profile has sent them. */
	name: string | null;
	email: string | null;
	/** A Co-authored-by line naming the agent on each commit. */
	creditAgent: boolean;
	/** Commits signed with this machine's SSH key. */
	signCommits: boolean;
};

/** The kinds of update Grid may reach a person about. */
export const NOTIFY_KINDS = ["approvals", "questions", "runs", "reviews", "following"] as const;
export type NotifyKind = (typeof NOTIFY_KINDS)[number];

/**
 * Where an update may reach a person: their desktop devices and their phones. There is no email
 * channel (nor an email digest): the runner has no way to send email, and the settings that
 * offered both did nothing. Prefs saved with them still load; the fields are dropped.
 */
export type Channels = { desktop: boolean; phone: boolean };

export type QuietHours = {
	on: boolean;
	/** "22:00" to "08:00", in `timezone`; overnight when `from` is later than `to`. */
	from: string;
	to: string;
	timezone: string;
	/** Approvals still reach the phone while it is quiet. */
	approvalsThrough: boolean;
	/** Quiet all day on Saturday and Sunday. */
	weekends: boolean;
};

export type NotifyPrefs = {
	channels: Record<NotifyKind, Channels>;
	quiet: QuietHours;
	/** Allow, deny or open from the notification without unlocking. */
	lockScreen: boolean;
};

export type PersonPrefs = { git: GitPrefs; notify: NotifyPrefs };

export const DEFAULT_PREFS: PersonPrefs = {
	git: { name: null, email: null, creditAgent: true, signCommits: false },
	notify: {
		channels: {
			approvals: { desktop: true, phone: true },
			questions: { desktop: true, phone: true },
			runs: { desktop: true, phone: false },
			reviews: { desktop: true, phone: true },
			following: { desktop: false, phone: false },
		},
		quiet: {
			on: false,
			from: "22:00",
			to: "08:00",
			timezone: "UTC",
			approvalsThrough: true,
			weekends: false,
		},
		lockScreen: true,
	},
};

/** Saved prefs over the defaults, so a field a newer runner added has its default. */
function merged(saved: Partial<PersonPrefs> | null): PersonPrefs {
	const notify: Partial<NotifyPrefs> = saved?.notify ?? {};
	const channel = (kind: NotifyKind): Channels => {
		const stored = notify.channels?.[kind];
		const fallback = DEFAULT_PREFS.notify.channels[kind];
		return { desktop: stored?.desktop ?? fallback.desktop, phone: stored?.phone ?? fallback.phone };
	};
	return {
		git: { ...DEFAULT_PREFS.git, ...saved?.git },
		notify: {
			channels: Object.fromEntries(NOTIFY_KINDS.map((kind) => [kind, channel(kind)])) as Record<
				NotifyKind,
				Channels
			>,
			quiet: { ...DEFAULT_PREFS.notify.quiet, ...notify.quiet },
			lockScreen: notify.lockScreen ?? DEFAULT_PREFS.notify.lockScreen,
		},
	};
}

export class PrefsStore {
	private readonly db: Database;

	constructor(path: string) {
		if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
		this.db = openPrivateDatabase(path);
		this.db.exec("PRAGMA journal_mode = WAL");
		this.db.exec(`CREATE TABLE IF NOT EXISTS person_prefs (
			owner_id TEXT PRIMARY KEY,
			prefs TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)`);
	}

	get(ownerId: string): PersonPrefs {
		const row = this.db
			.query<{ prefs: string }, [string]>("SELECT prefs FROM person_prefs WHERE owner_id = ?")
			.get(ownerId);
		if (!row) return merged(null);
		try {
			return merged(JSON.parse(row.prefs) as Partial<PersonPrefs>);
		} catch {
			return merged(null);
		}
	}

	set(ownerId: string, prefs: PersonPrefs): PersonPrefs {
		this.db
			.query(
				`INSERT INTO person_prefs (owner_id, prefs, updated_at) VALUES (?, ?, ?)
				ON CONFLICT (owner_id) DO UPDATE SET prefs = excluded.prefs, updated_at = excluded.updated_at`,
			)
			.run(ownerId, JSON.stringify(prefs), new Date().toISOString());
		return this.get(ownerId);
	}
}
