import { ChatError, type GridTool } from "../chat/hub";
import type { ChatSessionRow } from "../chat/store";
import { MEMORY_KINDS, MemoryError, type MemoryEntry, type ProjectMemory } from "./project-memory";

/**
 * The tools a thread's agent keeps and finds its project's memory with. Whatever it keeps is the
 * project's, for every later thread (people see it in the project's Memory page).
 */
export function memoryTools(
	memory: ProjectMemory,
	options: {
		/** The agent's name as people know it ("Claude Code"). */
		agentName?: (session: ChatSessionRow) => string;
		/** Something an agent kept, for the audit log. */
		saved?: (session: ChatSessionRow, entry: MemoryEntry) => void;
	} = {},
): GridTool[] {
	const told = (cause: unknown): never => {
		if (cause instanceof MemoryError) throw new ChatError(cause.message, cause.status);
		throw cause;
	};
	return [
		{
			name: "memory_save",
			description: `Keep one thing this project's later work should know, in a sentence or two: a decision and why it was made, a convention the code follows, the reason behind a fix, or a fact that took finding out. kind is one of ${MEMORY_KINDS.join(", ")}. Save what would have saved you time; not what the code or its docs already say plainly, and nothing secret.`,
			inputSchema: {
				type: "object",
				properties: {
					kind: { type: "string", enum: [...MEMORY_KINDS] },
					text: { type: "string", maxLength: 1000 },
				},
				required: ["kind", "text"],
			},
			run: (session, args) => {
				try {
					const saved = memory.save({
						workspaceId: session.workspaceId,
						project: session.project,
						kind: args.kind,
						text: args.text,
						by: {
							kind: "agent",
							id: session.id,
							name: options.agentName?.(session) ?? session.provider,
						},
						sessionId: session.id,
					});
					if (!saved.created) return "That is already in the project's memory.";
					options.saved?.(session, saved.entry);
					return "Kept in the project's memory.";
				} catch (cause) {
					return told(cause);
				}
			},
		},
		{
			name: "memory_search",
			description:
				"Look in this project's memory (what earlier threads and people kept: decisions, conventions, reasons behind fixes, facts) for what is about the words given. Look before deciding something the project may have decided already.",
			inputSchema: {
				type: "object",
				properties: { query: { type: "string" } },
				required: ["query"],
			},
			run: (session, args) => {
				const query = typeof args.query === "string" ? args.query : "";
				const found = memory.search(session.workspaceId, session.project, query, 10);
				if (!found.length) return "Nothing in the project's memory is about that.";
				return found
					.map((entry) => `- (${entry.kind}, ${entry.createdAt.slice(0, 10)}) ${entry.text}`)
					.join("\n");
			},
		},
	];
}
