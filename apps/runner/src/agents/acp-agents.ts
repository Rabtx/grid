import type { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { openPrivateDatabase } from "../private-database";

/**
 * ACP agents added from Settings → Agents & permissions: any agent that speaks the Agent Client
 * Protocol, by the command that starts it. Kept beside the chat log, so they survive restarts.
 */

export type AcpAgent = { id: string; name: string; command: string[]; createdAt: string };

/** "gemini --experimental-acp" → ["gemini", "--experimental-acp"], keeping quoted parts whole. */
export function splitCommand(text: string): string[] {
	const parts: string[] = [];
	for (const match of text.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g))
		parts.push(match[1] ?? match[2] ?? match[3] ?? "");
	return parts.filter(Boolean);
}

/** An id from a name: "Gemini CLI" → "gemini-cli". */
export function agentId(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 40);
}

export class AcpAgentStore {
	private readonly db: Database;

	constructor(path: string) {
		if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
		this.db = openPrivateDatabase(path);
		this.db.exec("PRAGMA journal_mode = WAL");
		this.db.exec(`CREATE TABLE IF NOT EXISTS acp_agents (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			command TEXT NOT NULL,
			created_at TEXT NOT NULL
		)`);
	}

	list(): AcpAgent[] {
		return this.db
			.query<{ id: string; name: string; command: string; created_at: string }, []>(
				"SELECT * FROM acp_agents ORDER BY created_at",
			)
			.all()
			.map((row) => ({
				id: row.id,
				name: row.name,
				command: JSON.parse(row.command) as string[],
				createdAt: row.created_at,
			}));
	}

	add(agent: Omit<AcpAgent, "createdAt">): AcpAgent {
		const createdAt = new Date().toISOString();
		this.db
			.query("INSERT INTO acp_agents (id, name, command, created_at) VALUES (?, ?, ?, ?)")
			.run(agent.id, agent.name, JSON.stringify(agent.command), createdAt);
		return { ...agent, createdAt };
	}

	remove(id: string): boolean {
		return this.db.query("DELETE FROM acp_agents WHERE id = ?").run(id).changes > 0;
	}
}
