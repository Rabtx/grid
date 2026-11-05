/** A run of the composer's text: plain, a file mention (`@path`), or a command (`/name`). */
export type PromptPart = { text: string; kind: "plain" | "mention" | "command" };

const MENTION = /(^|\s)(@[^\s@]+)/g;

/**
 * The composer's text cut into runs to highlight: a known command where the message starts with
 * one (`/name`, then a space or the end), and each `@` mention that starts a word.
 */
export function promptParts(text: string, commands: ReadonlySet<string>): PromptPart[] {
	const parts: PromptPart[] = [];
	let rest = text;
	const command = /^\/(\S+)(?=\s|$)/.exec(text);
	if (command?.[1] && commands.has(command[1].toLowerCase())) {
		parts.push({ text: command[0], kind: "command" });
		rest = text.slice(command[0].length);
	}
	let plainFrom = 0;
	for (const match of rest.matchAll(MENTION)) {
		const at = (match.index ?? 0) + (match[1]?.length ?? 0);
		const word = match[2] ?? "";
		if (at > plainFrom) parts.push({ text: rest.slice(plainFrom, at), kind: "plain" });
		parts.push({ text: word, kind: "mention" });
		plainFrom = at + word.length;
	}
	if (plainFrom < rest.length) parts.push({ text: rest.slice(plainFrom), kind: "plain" });
	return parts;
}
