import type { Database } from "bun:sqlite";

import { openPrivateDatabase } from "../private-database";

/**
 * What this runner is to the team control plane once it has enrolled: the machine id it acts as,
 * the workspace it joined and the secret it heartbeats with. Kept in the runner's private SQLite,
 * beside its chats, so a restart (or a container replacement) does not need the one-time code
 * again. The code is consumed; the secret is shown to no one.
 */
export type MachineIdentity = {
	machineId: string;
	workspaceId: string;
	name: string;
	secret: string;
	address: string | null;
	enrolledAt: string;
};

type Row = {
	machine_id: string;
	workspace_id: string;
	name: string;
	secret: string;
	address: string | null;
	enrolled_at: string;
};

export class MachineIdentityStore {
	private readonly db: Database;

	constructor(chatDb: string) {
		this.db = openPrivateDatabase(chatDb);
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS machine_identity (
				machine_id TEXT PRIMARY KEY,
				workspace_id TEXT NOT NULL,
				name TEXT NOT NULL,
				secret TEXT NOT NULL,
				address TEXT,
				enrolled_at TEXT NOT NULL
			)
		`);
	}

	get(): MachineIdentity | null {
		const row = this.db.query<Row, []>("SELECT * FROM machine_identity LIMIT 1").get();
		return row ? fromRow(row) : null;
	}

	save(identity: MachineIdentity): void {
		this.db.transaction(() => {
			this.db.run("DELETE FROM machine_identity");
			this.db.run(
				`INSERT INTO machine_identity
				   (machine_id, workspace_id, name, secret, address, enrolled_at)
				 VALUES (?, ?, ?, ?, ?, ?)`,
				[
					identity.machineId,
					identity.workspaceId,
					identity.name,
					identity.secret,
					identity.address,
					identity.enrolledAt,
				],
			);
		})();
	}

	clear(): void {
		this.db.run("DELETE FROM machine_identity");
	}

	close(): void {
		this.db.close();
	}
}

function fromRow(row: Row): MachineIdentity {
	return {
		machineId: row.machine_id,
		workspaceId: row.workspace_id,
		name: row.name,
		secret: row.secret,
		address: row.address,
		enrolledAt: row.enrolled_at,
	};
}
