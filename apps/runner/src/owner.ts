import type { Database } from "bun:sqlite";

import type { WorkspaceRole } from "./auth";
import { openPrivateDatabase } from "./private-database";

/** A signed-in person as the API described them: who they are and every workspace they are in. */
export type Person = {
	userId: string;
	email: string | null;
	workspaces: { id: string; role?: WorkspaceRole }[];
};

/** Why a person from another workspace is turned away. */
export const OTHER_WORKSPACE = "This runner works for another workspace";

/**
 * Whose machine this runner is on, and so which workspaces it serves: the ones its owner is in.
 * A runner opens shells and folders on its machine, so it must not answer anyone who can make a
 * workspace on the same API (which is anyone who can sign up).
 *
 * The owner is `RUNNER_OWNER` (an email or user id) when set. Otherwise it is the first workspace
 * owner to sign in, and on a runner that already holds work, only an owner of a workspace that
 * work belongs to. Each time the owner signs in, the workspaces served follow theirs, so a
 * workspace they join or make is served and one they leave is not.
 */
export class RunnerOwner {
	private readonly db: Database;
	private owner: { userId: string; workspaces: Set<string> } | null;

	constructor(
		path: string,
		private readonly configured: string | null = null,
		/** Workspaces this runner already keeps work for, from before it had an owner. */
		private readonly existing: () => string[] = () => [],
	) {
		this.db = openPrivateDatabase(path);
		this.db.run(
			"CREATE TABLE IF NOT EXISTS runner_owner (user_id TEXT PRIMARY KEY, workspaces TEXT NOT NULL)",
		);
		const row = this.db.query("SELECT user_id, workspaces FROM runner_owner LIMIT 1").get() as {
			user_id: string;
			workspaces: string;
		} | null;
		this.owner = row
			? { userId: row.user_id, workspaces: new Set(JSON.parse(row.workspaces) as string[]) }
			: null;
	}

	/** Whether this runner answers this person acting in this workspace. */
	admits(person: Person, workspace: string): boolean {
		if (this.isConfigured(person)) {
			this.keep(person);
			return true;
		}
		if (this.owner && person.userId !== this.owner.userId)
			return this.owner.workspaces.has(workspace);
		if (!this.owner && !this.mayClaim(person, workspace)) return false;
		this.keep(person);
		return true;
	}

	private mayClaim(person: Person, workspace: string): boolean {
		if (this.configured) return false;
		const owned = new Set(
			person.workspaces.filter((item) => item.role === "owner").map((item) => item.id),
		);
		const existing = this.existing();
		return existing.length > 0 ? existing.some((id) => owned.has(id)) : owned.has(workspace);
	}

	private isConfigured(person: Person): boolean {
		return this.configured !== null && [person.userId, person.email].includes(this.configured);
	}

	private keep(person: Person): void {
		const workspaces = person.workspaces.map((item) => item.id);
		const same =
			this.owner?.userId === person.userId &&
			this.owner.workspaces.size === workspaces.length &&
			workspaces.every((id) => this.owner?.workspaces.has(id));
		if (same) return;
		this.owner = { userId: person.userId, workspaces: new Set(workspaces) };
		this.db.transaction(() => {
			this.db.run("DELETE FROM runner_owner");
			this.db.run("INSERT INTO runner_owner (user_id, workspaces) VALUES (?, ?)", [
				person.userId,
				JSON.stringify(workspaces),
			]);
		})();
	}
}
