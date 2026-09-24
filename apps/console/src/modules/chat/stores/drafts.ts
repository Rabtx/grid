// A message waiting for a project's next new thread: "start a thread from this task" leaves it
// here and the new-thread composer takes it once.
const drafts = new Map<string, string>();

export const draftsStore = {
	set(project: string, text: string): void {
		drafts.set(project, text);
	},
	/** The waiting draft, removed as it is read. */
	take(project: string): string | undefined {
		const text = drafts.get(project);
		drafts.delete(project);
		return text;
	},
};

/** What a thread started from a task opens with. */
export function taskDraft(task: {
	key: string;
	title: string;
	description?: string | null;
}): string {
	const details = task.description?.trim();
	return `Work on ${task.key}: ${task.title}${details ? `\n\n${details}` : ""}`;
}
