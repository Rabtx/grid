import type { Automation } from "@/modules/automations/services/automations.service";
import type { InboxItem } from "@/modules/inbox";
import type { Task, TaskStatus } from "@/modules/projects";

/** A task with the project it belongs to, so a row across projects can say where it lives. */
export type ProjectTask = { project: { slug: string; name: string }; task: Task };

/** The stages that count as work in flight, most urgent first. */
const MOVING: readonly TaskStatus[] = ["blocked", "review", "qa", "in_progress"];

/** How many rows each part of Today shows; the full lists are one tap away. */
export const LIMITS = { needs: 5, moving: 6, upcoming: 4 } as const;

/** "Good morning" before noon, "Good afternoon" until five, "Good evening" after. */
export function greeting(date: Date): string {
	const hour = date.getHours();
	if (hour < 12) return "Good morning";
	if (hour < 17) return "Good afternoon";
	return "Good evening";
}

/** The day as people say it: "Thursday, 1 October". */
export function dayLabel(date: Date): string {
	return date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * One line under the greeting: what needs you and what is moving. `needs` is null while the inbox
 * has not answered, so the line never claims nothing needs you before it knows.
 */
export function summary(needs: number | null, moving: number): string {
	const parts = [
		needs === null
			? null
			: needs > 0
				? `${plural(needs, "thing needs", "things need")} you`
				: "Nothing needs you",
		moving > 0 ? `${plural(moving, "task", "tasks")} moving` : null,
	];
	return parts.filter(Boolean).join(" · ");
}

/** The unread inbox items, newest first, at most `LIMITS.needs`. */
export function needsYou(items: readonly InboxItem[]): InboxItem[] {
	return items
		.filter((item) => item.readAt === null)
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
		.slice(0, LIMITS.needs);
}

/**
 * Work in flight across projects: blocked first (it needs someone), then review and QA (it needs
 * a look), then in progress; the most recently touched first within each stage.
 */
export function movingTasks(entries: readonly ProjectTask[]): ProjectTask[] {
	return entries
		.filter((entry) => MOVING.includes(entry.task.status))
		.sort(
			(a, b) =>
				MOVING.indexOf(a.task.status) - MOVING.indexOf(b.task.status) ||
				b.task.updatedAt.localeCompare(a.task.updatedAt),
		);
}

/** Who has a task, as the row says it: the agent or person's name, or that nobody has it. */
export function ownerLabel(task: Task): string {
	if (!task.owner) return "Unassigned";
	return task.owner.name ?? (task.owner.kind === "agent" ? "An agent" : "Someone");
}

/** Enabled automations with a next run, soonest first, at most `LIMITS.upcoming`. */
export function upcoming(items: readonly Automation[]): Automation[] {
	return items
		.filter((item) => item.enabled && item.nextRunAt !== null)
		.sort((a, b) => (a.nextRunAt ?? "").localeCompare(b.nextRunAt ?? ""))
		.slice(0, LIMITS.upcoming);
}

/** "3 need you", "1 needs you". */
export function needLabel(count: number): string {
	return `${count} need${count === 1 ? "s" : ""} you`;
}

/** The day short, for the phone header: "Thu 1 Oct". */
export function shortDay(date: Date): string {
	return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/**
 * What happened while you were away: inbox items from the last day that are already dealt with
 * (anything unread is under Needs you instead), newest first, at most five.
 */
export function recentlyDone(items: readonly InboxItem[], now: number): InboxItem[] {
	const since = now - 24 * 60 * 60 * 1000;
	return items
		.filter((item) => Date.parse(item.createdAt) >= since && item.readAt !== null)
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
		.slice(0, 5);
}
