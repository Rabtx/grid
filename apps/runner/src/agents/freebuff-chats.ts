import { readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

import { squash } from "./freebuff-screen";

/**
 * Freebuff's own record of its conversations. The CLI keeps each one in a folder named by its id,
 * with the messages as JSON (the same shape its `/export` writes): the exact Markdown, reasoning
 * and tools of every reply, and whether the reply is complete. The adapter only reads it, to know
 * exactly when a turn has ended and what it said; the screen still gives the live text.
 */

export type FreebuffMessage = {
	id?: unknown;
	variant?: unknown;
	content?: unknown;
	blocks?: unknown;
	metadata?: { isComplete?: unknown } | null;
};

export type FreebuffChat = { id: string; messages: FreebuffMessage[] };

/** Where the CLI keeps its state: `$XDG_CONFIG_HOME/manicode`, or `~/.config/manicode`. */
export function freebuffStateDir(env: Record<string, string | undefined> = process.env): string {
	return join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "manicode");
}

/** A folder's conversations, one directory each (Freebuff files them by the folder's name). */
export function chatsDir(stateDir: string, cwd: string): string {
	return join(stateDir, "projects", basename(cwd), "chats");
}

/** Messages are stamped in their ids (`user-1790518979225`); allow for clocks a little apart. */
const STAMP_SLACK_MS = 5_000;

/**
 * Where the person's last message is, if it is this one, sent since `since`: the same words sent
 * again must not find the earlier message and its old reply. Compared loosely, since the CLI may
 * reflow whitespace.
 */
function lastSent(messages: FreebuffMessage[], prompt: string, since: number): number {
	const index = messages.findLastIndex((message) => message.variant === "user");
	if (index < 0) return -1;
	const message = messages[index];
	const content = typeof message.content === "string" ? message.content : "";
	if (squash(content) !== squash(prompt)) return -1;
	const stamp = Number(String(message.id ?? "").match(/^user-(\d{12,})$/)?.[1] ?? Number.NaN);
	return Number.isNaN(stamp) || stamp >= since - STAMP_SLACK_MS ? index : -1;
}

/**
 * Where the reply to `prompt` stands: not in the file yet, still being written, or complete. Only
 * the agent's messages after the person's count, not Freebuff's own notices (`sys-…`).
 */
export function replyState(
	messages: FreebuffMessage[],
	prompt: string,
	since: number,
): "missing" | "running" | "complete" {
	const sent = lastSent(messages, prompt, since);
	if (sent < 0) return "missing";
	const replies = messages
		.slice(sent + 1)
		.filter((message) => message.variant === "ai" && !String(message.id ?? "").startsWith("sys-"));
	return replies.some((message) => message.metadata?.isComplete === true) ? "complete" : "running";
}

/** The text of the reply to `prompt` so far (its text blocks, not its reasoning). */
export function replyText(messages: FreebuffMessage[], prompt: string, since: number): string {
	const sent = lastSent(messages, prompt, since);
	if (sent < 0) return "";
	const parts: string[] = [];
	for (const message of messages.slice(sent + 1)) {
		if (message.variant !== "ai" || !Array.isArray(message.blocks)) continue;
		for (const block of message.blocks as Record<string, unknown>[]) {
			if (
				block.type === "text" &&
				block.textType !== "reasoning" &&
				typeof block.content === "string"
			)
				parts.push(block.content);
		}
	}
	return parts.join("\n\n");
}

async function readMessages(dir: string, id: string): Promise<FreebuffMessage[] | null> {
	try {
		const messages = (await Bun.file(join(dir, id, "chat-messages.json")).json()) as unknown;
		return Array.isArray(messages) ? (messages as FreebuffMessage[]) : null;
	} catch {
		// Not there yet, or caught mid-write: read it again on the next look.
		return null;
	}
}

/**
 * The conversation a turn is in. With its id, that one; otherwise the newest conversation of the
 * folder changed since `since` whose last message from the person is `prompt`.
 */
export async function findChat(
	dir: string,
	prompt: string,
	since: number,
	id?: string,
): Promise<FreebuffChat | null> {
	if (id) {
		const messages = await readMessages(dir, id);
		return messages ? { id, messages } : null;
	}
	let names: string[];
	try {
		names = readdirSync(dir);
	} catch {
		return null;
	}
	const recent = names
		.map((name) => {
			// The messages file changes as the reply is saved; the folder only when files come and go.
			try {
				return { name, changed: statSync(join(dir, name, "chat-messages.json")).mtimeMs };
			} catch {
				return { name, changed: 0 };
			}
		})
		.filter((entry) => entry.changed >= since - 2_000)
		.sort((a, b) => b.changed - a.changed);
	for (const { name } of recent) {
		const messages = await readMessages(dir, name);
		if (messages && lastSent(messages, prompt, since) >= 0) return { id: name, messages };
	}
	return null;
}
