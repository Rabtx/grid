import { Database } from "bun:sqlite";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Secrets for connectors (API keys, tokens, database URLs), kept by the runner on this machine.
 * Values are encrypted (AES-GCM) with a key in a file only this user can read, beside the
 * database; the database alone gives nothing away. Per workspace, by name.
 */
export class Vault {
	private readonly db: Database;
	private key: CryptoKey | null = null;

	constructor(
		path: string,
		private readonly keyFile: string,
	) {
		if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
		this.db = new Database(path, { create: true });
		this.db.exec("PRAGMA journal_mode = WAL");
		this.db.exec(`CREATE TABLE IF NOT EXISTS vault_secrets (
			workspace TEXT NOT NULL,
			name TEXT NOT NULL,
			value TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			PRIMARY KEY (workspace, name)
		)`);
	}

	private async cipher(): Promise<CryptoKey> {
		if (this.key) return this.key;
		let raw: Uint8Array<ArrayBuffer>;
		if (existsSync(this.keyFile)) {
			raw = new Uint8Array(Buffer.from(readFileSync(this.keyFile, "utf8").trim(), "base64"));
		} else {
			raw = crypto.getRandomValues(new Uint8Array(32));
			mkdirSync(dirname(this.keyFile), { recursive: true });
			writeFileSync(this.keyFile, Buffer.from(raw).toString("base64"), { mode: 0o600 });
			chmodSync(this.keyFile, 0o600);
		}
		this.key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
		return this.key;
	}

	async set(workspace: string, name: string, value: string): Promise<void> {
		const iv = crypto.getRandomValues(new Uint8Array(12));
		const sealed = await crypto.subtle.encrypt(
			{ name: "AES-GCM", iv },
			await this.cipher(),
			new TextEncoder().encode(value),
		);
		const stored = `${Buffer.from(iv).toString("base64")}.${Buffer.from(sealed).toString("base64")}`;
		this.db
			.query(
				`INSERT INTO vault_secrets (workspace, name, value, updated_at) VALUES (?, ?, ?, ?)
				 ON CONFLICT (workspace, name) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
			)
			.run(workspace, name, stored, new Date().toISOString());
	}

	async get(workspace: string, name: string): Promise<string | null> {
		const row = this.db
			.query<{ value: string }, [string, string]>(
				"SELECT value FROM vault_secrets WHERE workspace = ? AND name = ?",
			)
			.get(workspace, name);
		if (!row) return null;
		const [iv, sealed] = row.value.split(".");
		if (!iv || !sealed) return null;
		try {
			const plain = await crypto.subtle.decrypt(
				{ name: "AES-GCM", iv: Buffer.from(iv, "base64") },
				await this.cipher(),
				Buffer.from(sealed, "base64"),
			);
			return new TextDecoder().decode(plain);
		} catch {
			// The key file was replaced: the secret cannot be read and has to be entered again.
			return null;
		}
	}

	/** The names of a workspace's secrets, never their values. */
	names(workspace: string): { name: string; updatedAt: string }[] {
		return this.db
			.query<{ name: string; updated_at: string }, [string]>(
				"SELECT name, updated_at FROM vault_secrets WHERE workspace = ? AND name NOT LIKE 'connector:%' ORDER BY name",
			)
			.all(workspace)
			.map((row) => ({ name: row.name, updatedAt: row.updated_at }));
	}

	delete(workspace: string, name: string): void {
		this.db
			.query("DELETE FROM vault_secrets WHERE workspace = ? AND name = ?")
			.run(workspace, name);
	}
}
