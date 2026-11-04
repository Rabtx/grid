import type { Role } from "../roles/store";
import type { TeammateLesson } from "./store";

/**
 * A teammate's brief as its agent gets it with a thread's first message: what it is, how it works,
 * the skills it reads first, and what the team has taught it. Lessons are the team's own words and
 * go in as instructions from the team; the agent is told how to propose new ones.
 */
export function teammateBrief(
	role: Pick<Role, "specialty" | "brief">,
	extras: { skills: string; lessons: readonly TeammateLesson[] },
): string {
	const kept = extras.lessons.filter((lesson) => lesson.state === "kept");
	return [
		role.specialty ? `Your specialty: ${role.specialty}.` : null,
		role.brief.trim() || null,
		extras.skills
			? `Your skills. Read a skill's SKILL.md before work it covers, and follow it:\n${extras.skills}`
			: null,
		kept.length
			? `What the team has taught you. Follow these:\n${kept.map((lesson) => `- ${lesson.text}`).join("\n")}`
			: null,
		"When a person corrects how you work, in a way that should hold next time too, call Grid's teammate_remember tool with that lesson in one short line. A person approves it before it is kept.",
	]
		.filter(Boolean)
		.join("\n\n");
}
