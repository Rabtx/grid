import type { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { setupCommand } from "../agents/setup";
import { mergeLimits, type UsageLimit } from "../agents/rate-limits";
import { openPrivateDatabase } from "../private-database";

/**
 * A person's accounts with an agent's provider on this machine: a second Claude or ChatGPT plan
 * beside the machine's own sign-in. Each lives in its own config folder (`CLAUDE_CONFIG_DIR`,
 * `CODEX_HOME`), signed in there with the agent's own command, and a thread picks which one it
 * runs as. Grid never reads the credentials inside; the agent does.
 *
 * What each account has used of its plan, as its agents report it, is kept here too, so the
 * sidebar's rings show it between turns and across restarts.
 */
export const ACCOUNT_ENV: Record<string, string> = {
	claude: "CLAUDE_CONFIG_DIR",
	codex: "CODEX_HOME",
};

export type ProviderAccount = {
	id: string;
	provider: string;
	label: string;
	createdAt: string;
};

/** What an account (null: the machine's own sign-in) has used, by window. */
export type AccountUsage = {
	provider: string;
	account: string | null;
	limits: UsageLimit[];
	updatedAt: string;
};

const LABEL_MAX = 60;
const ACCOUNTS_PER_PROVIDER = 8;

type AccountRow = { id: string; provider: string; label: string; created_at: string };
type UsageRow = { provider: string; account: string; limits: string; updated_at: string };

export class AccountError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
	}
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

export class Accounts {
	private readonly db: Database;

	/** `root` holds each account's config folder, `<root>/<provider>/<id>`. */
	constructor(
		path: string,
		private readonly root: string,
		private readonly now: () => Date = () => new Date(),
	) {
		this.db = openPrivateDatabase(path);
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS provider_accounts (
				id TEXT PRIMARY KEY,
				owner_id TEXT NOT NULL,
				provider TEXT NOT NULL,
				label TEXT NOT NULL,
				created_at TEXT NOT NULL
			);
			CREATE TABLE IF NOT EXISTS provider_usage (
				owner_id TEXT NOT NULL,
				provider TEXT NOT NULL,
				account TEXT NOT NULL,
				limits TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				PRIMARY KEY (owner_id, provider, account)
			);
		`);
	}

	close(): void {
		this.db.close();
	}

	/** Whether a provider's agent can run as another account here. */
	static supports(provider: string): boolean {
		return provider in ACCOUNT_ENV;
	}

	list(owner: string): ProviderAccount[] {
		return this.db
			.query<AccountRow, [string]>(
				"SELECT id, provider, label, created_at FROM provider_accounts WHERE owner_id = ? ORDER BY created_at",
			)
			.all(owner)
			.map((row) => ({
				id: row.id,
				provider: row.provider,
				label: row.label,
				createdAt: row.created_at,
			}));
	}

	find(owner: string, id: string): ProviderAccount | null {
		return this.list(owner).find((account) => account.id === id) ?? null;
	}

	create(owner: string, provider: string, label: string): ProviderAccount {
		if (!Accounts.supports(provider))
			throw new AccountError("That agent cannot run as another account", 400);
		const name = label.trim().slice(0, LABEL_MAX);
		if (!name) throw new AccountError("Name the account", 400);
		if (
			this.list(owner).filter((account) => account.provider === provider).length >=
			ACCOUNTS_PER_PROVIDER
		)
			throw new AccountError("That agent has as many accounts as Grid keeps", 409);
		const account: ProviderAccount = {
			id: crypto.randomUUID(),
			provider,
			label: name,
			createdAt: this.now().toISOString(),
		};
		mkdirSync(this.dir(account), { recursive: true, mode: 0o700 });
		this.db
			.query(
				"INSERT INTO provider_accounts (id, owner_id, provider, label, created_at) VALUES (?, ?, ?, ?, ?)",
			)
			.run(account.id, owner, provider, name, account.createdAt);
		return account;
	}

	rename(owner: string, id: string, label: string): ProviderAccount {
		const account = this.find(owner, id);
		if (!account) throw new AccountError("No such account", 404);
		const name = label.trim().slice(0, LABEL_MAX);
		if (!name) throw new AccountError("Name the account", 400);
		this.db
			.query("UPDATE provider_accounts SET label = ? WHERE id = ? AND owner_id = ?")
			.run(name, id, owner);
		return { ...account, label: name };
	}

	/** Forget an account and its config folder (its sign-in with it). */
	remove(owner: string, id: string): void {
		const account = this.find(owner, id);
		if (!account) throw new AccountError("No such account", 404);
		this.db.query("DELETE FROM provider_accounts WHERE id = ? AND owner_id = ?").run(id, owner);
		this.db
			.query("DELETE FROM provider_usage WHERE owner_id = ? AND provider = ? AND account = ?")
			.run(owner, account.provider, id);
		rmSync(this.dir(account), { recursive: true, force: true });
	}

	/** The environment that points the agent at an account; empty for the machine's own. */
	env(owner: string, provider: string, id: string | null | undefined): Record<string, string> {
		if (!id) return {};
		const account = this.find(owner, id);
		const name = ACCOUNT_ENV[provider];
		if (!account || account.provider !== provider || !name) return {};
		return { [name]: this.dir(account) };
	}

	/** The agent's own sign-in, pointed at the account's folder, to type into a terminal. */
	signInCommand(owner: string, id: string): string | null {
		const account = this.find(owner, id);
		const name = account ? ACCOUNT_ENV[account.provider] : undefined;
		const command = account ? setupCommand(account.provider, "sign-in") : null;
		if (!account || !name || !command) return null;
		return `${name}=${shellQuote(this.dir(account))} ${command}`;
	}

	/** Fold an agent's report into what the account is known to have used. */
	recordUsage(owner: string, provider: string, account: string | null, limits: UsageLimit[]): void {
		const key = account ?? "";
		const known = this.db
			.query<UsageRow, [string, string, string]>(
				"SELECT * FROM provider_usage WHERE owner_id = ? AND provider = ? AND account = ?",
			)
			.get(owner, provider, key);
		const merged = mergeLimits(known ? (JSON.parse(known.limits) as UsageLimit[]) : [], limits);
		this.db
			.query(
				`INSERT INTO provider_usage (owner_id, provider, account, limits, updated_at) VALUES (?, ?, ?, ?, ?)
				 ON CONFLICT (owner_id, provider, account) DO UPDATE SET limits = excluded.limits, updated_at = excluded.updated_at`,
			)
			.run(owner, provider, key, JSON.stringify(merged), this.now().toISOString());
	}

	/** Everything known about what this person's accounts have used; a window past its reset reads 0. */
	usage(owner: string): AccountUsage[] {
		const now = this.now().getTime();
		return this.db
			.query<UsageRow, [string]>(
				"SELECT * FROM provider_usage WHERE owner_id = ? ORDER BY provider, account",
			)
			.all(owner)
			.map((row) => ({
				provider: row.provider,
				account: row.account || null,
				updatedAt: row.updated_at,
				limits: (JSON.parse(row.limits) as UsageLimit[]).map((limit) =>
					limit.resetsAt && Date.parse(limit.resetsAt) <= now
						? { ...limit, usedPercent: 0, limited: false, resetsAt: null }
						: limit,
				),
			}));
	}

	private dir(account: ProviderAccount): string {
		return join(this.root, account.provider, account.id);
	}
}
