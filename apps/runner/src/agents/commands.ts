import type { AgentCommand } from "./events";

/**
 * The commands an agent offers, taken only from what the agent itself reported.
 *
 * Everything here came off a child process, so it is treated as untrusted: a name that is not
 * something a person could type is dropped rather than shown, lengths are capped so a runaway
 * description cannot fill a menu, and a name the agent listed twice is listed once. An agent that
 * reports nothing gets no commands — Grid never invents them.
 */

/** What a person can type after the slash: letters, digits, `_`, `:`, `.` and `-`. */
const NAME = /^[\w:.-]{1,64}$/;
const MAX_DESCRIPTION = 200;
const MAX_HINT = 120;
const MAX_COMMANDS = 200;

/** One line of text from an agent, with the length a menu can show. */
function text(value: unknown, limit: number): string {
	if (typeof value !== "string") return "";
	// Control characters would sit in the middle of a menu row; collapse the whitespace instead.
	return value.replace(/\s+/g, " ").trim().slice(0, limit);
}

/** A name as typed, or null when it is not one: never shortened, so two names cannot collide. */
function name(raw: unknown): string | null {
	if (typeof raw !== "string") return null;
	const trimmed = raw.trim();
	return NAME.test(trimmed) ? trimmed : null;
}

/**
 * One agent command as a menu entry, or null when it cannot be shown: no usable name, or a
 * description that said nothing.
 */
export function agentCommand(raw: unknown): AgentCommand | null {
	if (!raw || typeof raw !== "object") return null;
	const entry = raw as { name?: unknown; description?: unknown; input?: unknown; hint?: unknown };
	const typed = name(entry.name);
	if (!typed) return null;
	const description = text(entry.description, MAX_DESCRIPTION);
	if (!description) return null;
	// ACP calls the argument a hint inside `input`; other agents send it beside the name.
	const input = entry.input as { hint?: unknown } | undefined;
	const hint = text(entry.hint, MAX_HINT) || text(input?.hint, MAX_HINT);
	return { name: typed, description, ...(hint ? { hint } : {}) };
}

/**
 * A whole list an agent reported: each entry checked, the first of a repeated name kept, and the
 * list kept to a menu's worth. An empty or malformed list gives no commands, not an error: an
 * agent that offers none is a normal thing.
 */
export function agentCommands(raw: unknown): AgentCommand[] {
	if (!Array.isArray(raw)) return [];
	const seen = new Set<string>();
	const commands: AgentCommand[] = [];
	for (const entry of raw) {
		if (commands.length >= MAX_COMMANDS) break;
		const command = agentCommand(entry);
		if (!command || seen.has(command.name)) continue;
		seen.add(command.name);
		commands.push(command);
	}
	return commands;
}
