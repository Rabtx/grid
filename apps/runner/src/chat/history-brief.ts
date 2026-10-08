import type { ChatEvent } from "../agents/events";

/** How much of the earlier conversation a fresh agent is given, at most. */
const BUDGET = 12_000;
/** How much of one reply or message is kept before it is cut. */
const PER_TEXT = 2_000;

type Turn = { asked: string; replied: string; files: Set<string> };

/**
 * What a fresh agent is told about a thread it has no memory of: one restored from another
 * machine, or one whose agent session was cleared. Each earlier turn as the person's message, the
 * agent's reply and the files it changed, newest kept first when the budget runs out. Null when
 * there is nothing earlier worth telling.
 */
export function historyBrief(events: readonly ChatEvent[], budget: number = BUDGET): string | null {
	const turns: Turn[] = [];
	let turn: Turn | null = null;
	for (const event of events) {
		if (event.type === "user") {
			turn = { asked: event.text.trim(), replied: "", files: new Set() };
			turns.push(turn);
		} else if (turn && event.type === "message") {
			turn.replied += event.text;
		} else if (turn && event.type === "tool" && event.diffs) {
			for (const diff of event.diffs) turn.files.add(diff.path);
		}
	}
	const told = turns.filter((item) => item.asked || item.replied.trim());
	if (!told.length) return null;

	const parts: string[] = [];
	let used = 0;
	let left = 0;
	for (let i = told.length - 1; i >= 0; i--) {
		const item = told[i];
		if (!item) continue;
		const lines = [`Person: ${cut(item.asked)}`];
		if (item.replied.trim()) lines.push(`You: ${cut(item.replied.trim())}`);
		if (item.files.size) lines.push(`Files you changed: ${[...item.files].join(", ")}`);
		const text = lines.join("\n");
		if (used + text.length > budget && parts.length) {
			left = i + 1;
			break;
		}
		parts.unshift(text);
		used += text.length;
	}
	const skipped = left ? `(${left} earlier ${left === 1 ? "turn" : "turns"} left out.)\n\n` : "";
	return [
		"This thread began before this session, so you have no memory of it. Here is what was said, oldest first:",
		"",
		`${skipped}${parts.join("\n\n")}`,
	].join("\n");
}

function cut(text: string): string {
	return text.length > PER_TEXT ? `${text.slice(0, PER_TEXT)}…` : text;
}
