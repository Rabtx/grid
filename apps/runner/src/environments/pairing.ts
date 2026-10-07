import type { Database } from "bun:sqlite";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { openPrivateDatabase } from "../private-database";

/**
 * The environment side of pairing: this runner lets another Grid (the "home" Grid) drive its
 * terminals and agents. The person proves they control both machines with a one-time code shown
 * only here; the home Grid trades it for a long-lived secret, of which this side keeps only a hash.
 * From then on the home Grid calls with an environment token instead of a person's session, so
 * nobody's sign-in ever leaves their home Grid. A pairing belongs to the one person who made it:
 * its token acts as them and nobody else.
 */

const CODE_TTL_MS = 10 * 60 * 1000;
// Unambiguous letters and digits: no 0/O, 1/I/L.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
// Wrong codes allowed in one window before every outstanding code is thrown away.
const MAX_FAILURES = 10;

const TOKEN_PREFIX = "grid-env";

function sha256(text: string): string {
	return createHash("sha256").update(text).digest("hex");
}

function sameHash(a: string, b: string): boolean {
	const left = Buffer.from(a, "hex");
	const right = Buffer.from(b, "hex");
	return left.length === right.length && timingSafeEqual(left, right);
}

/** `ABCD-EF23` → `ABCDEF23`: codes are typed on phones, so case, spaces and dashes don't matter. */
function normalise(code: string): string {
	return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** What the home Grid sends as its bearer token: which pairing, and its secret. */
export function environmentToken(peerId: string, secret: string): string {
	return `${TOKEN_PREFIX}.${peerId}.${secret}`;
}

export function isEnvironmentToken(token: string): boolean {
	return token.startsWith(`${TOKEN_PREFIX}.`);
}

export type Peer = {
	id: string;
	ownerId: string;
	label: string;
	createdAt: string;
	lastSeenAt: string | null;
};

export class PairingStore {
	private readonly db: Database;
	private failures: { count: number; since: number } = { count: 0, since: 0 };

	constructor(
		path: string,
		private readonly now: () => number = Date.now,
	) {
		if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
		this.db = openPrivateDatabase(path);
		this.db.exec("PRAGMA journal_mode = WAL");
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS pairing_codes (
				code_hash TEXT PRIMARY KEY,
				expires_at INTEGER NOT NULL
			);
			CREATE TABLE IF NOT EXISTS paired_grids (
				id TEXT PRIMARY KEY,
				owner_id TEXT NOT NULL,
				label TEXT NOT NULL,
				secret_hash TEXT NOT NULL,
				created_at TEXT NOT NULL,
				last_seen_at TEXT
			);
		`);
	}

	/** A fresh one-time code, good for ten minutes. Only its hash is stored. */
	newCode(): string {
		// Rejection sampling, so every letter is equally likely.
		const limit = 256 - (256 % CODE_ALPHABET.length);
		let code = "";
		while (code.length < 8) {
			for (const byte of randomBytes(16)) {
				if (byte < limit && code.length < 8) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
			}
		}
		this.db
			.query("INSERT INTO pairing_codes (code_hash, expires_at) VALUES (?, ?)")
			.run(sha256(code), this.now() + CODE_TTL_MS);
		return `${code.slice(0, 4)}-${code.slice(4)}`;
	}

	/**
	 * Trade a code for a pairing, as the person the home Grid signed in. A code works once, and
	 * ten wrong ones within its lifetime void every outstanding code, so guessing is not worth it.
	 */
	pair(code: string, label: string, ownerId: string): { peerId: string; secret: string } | null {
		const now = this.now();
		this.db.query("DELETE FROM pairing_codes WHERE expires_at <= ?").run(now);
		const hash = sha256(normalise(code));
		const found = this.db
			.query<{ code_hash: string }, [string]>(
				"SELECT code_hash FROM pairing_codes WHERE code_hash = ?",
			)
			.get(hash);
		if (!found) {
			if (now - this.failures.since > CODE_TTL_MS) this.failures = { count: 0, since: now };
			this.failures.count += 1;
			if (this.failures.count >= MAX_FAILURES) this.db.exec("DELETE FROM pairing_codes");
			return null;
		}
		this.db.query("DELETE FROM pairing_codes WHERE code_hash = ?").run(hash);

		const peerId = crypto.randomUUID();
		const secret = randomBytes(32).toString("base64url");
		this.db
			.query(
				`INSERT INTO paired_grids (id, owner_id, label, secret_hash, created_at)
				VALUES (?, ?, ?, ?, ?)`,
			)
			.run(
				peerId,
				ownerId,
				label.trim().slice(0, 80) || "Grid",
				sha256(secret),
				new Date(now).toISOString(),
			);
		return { peerId, secret };
	}

	/** The person a paired Grid acts for, or null when the token is not a live pairing. */
	verify(token: string): string | null {
		const [prefix, peerId, secret, ...rest] = token.split(".");
		if (prefix !== TOKEN_PREFIX || !peerId || !secret || rest.length > 0) return null;
		const row = this.db
			.query<{ owner_id: string; secret_hash: string }, [string]>(
				"SELECT owner_id, secret_hash FROM paired_grids WHERE id = ?",
			)
			.get(peerId);
		if (!row || !sameHash(row.secret_hash, sha256(secret))) return null;
		this.db
			.query("UPDATE paired_grids SET last_seen_at = ? WHERE id = ?")
			.run(new Date(this.now()).toISOString(), peerId);
		return row.owner_id;
	}

	/** Forget a pairing: the home Grid's secret stops working at once. */
	unpair(token: string): boolean {
		if (!this.verify(token)) return false;
		const peerId = token.split(".")[1];
		this.db.query("DELETE FROM paired_grids WHERE id = ?").run(peerId);
		return true;
	}

	peers(): Peer[] {
		return this.db
			.query<
				{
					id: string;
					owner_id: string;
					label: string;
					created_at: string;
					last_seen_at: string | null;
				},
				[]
			>(
				"SELECT id, owner_id, label, created_at, last_seen_at FROM paired_grids ORDER BY created_at",
			)
			.all()
			.map((row) => ({
				id: row.id,
				ownerId: row.owner_id,
				label: row.label,
				createdAt: row.created_at,
				lastSeenAt: row.last_seen_at,
			}));
	}
}
