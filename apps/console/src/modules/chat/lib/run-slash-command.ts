import { notify } from "@/kit";
import { projectsService, TASK_STATUS_LABELS } from "@/modules/projects";

import type { Choice } from "../types/chat.types";
import type { SlashCommand } from "./slash-commands";

/**
 * What a screen can do for Grid's commands. Leave one out when it cannot happen here, and the
 * command says why instead of doing nothing.
 */
export type SlashCommandActions = {
	running: boolean;
	/** Start a new thread; left out where this already is one. */
	newThread?: () => void;
	openModel?: () => void;
	openMode?: () => void;
	efforts: readonly Choice[];
	/** Set the effort; left out while it cannot be sent, e.g. the link is down. */
	setEffort?: (id: string) => void;
	stop?: () => void;
	addTask?: (title: string) => void;
	addNote?: (text: string) => void;
};

function refuse(title: string): false {
	notify({ title, tone: "danger" });
	return false;
}

/** The effort level an argument names, by id or name; null (and a toast saying why) otherwise. */
export function findEffort(efforts: readonly Choice[], argument: string): Choice | null {
	if (efforts.length === 0) {
		refuse("This model has no effort levels");
		return null;
	}
	const levels = efforts.map((item) => item.id).join(", ");
	const wanted = argument.trim().toLowerCase();
	if (!wanted) {
		refuse(`Choose an effort: ${levels}`);
		return null;
	}
	const level = efforts.find(
		(item) => item.id.toLowerCase() === wanted || item.name.toLowerCase() === wanted,
	);
	if (!level) refuse(`Unknown effort: ${argument.trim()}. Try ${levels}`);
	return level ?? null;
}

/**
 * Run one of Grid's commands. True when it ran (the composer clears); false keeps the draft, and
 * a toast has said why.
 */
export function runSlashCommand(
	command: SlashCommand,
	argument: string,
	actions: SlashCommandActions,
): boolean {
	switch (command.id) {
		case "new":
			if (!actions.newThread) {
				notify({ title: "This is a new thread already" });
				return true;
			}
			actions.newThread();
			return true;
		case "model":
			if (!actions.openModel) return refuse("No models to choose from here");
			actions.openModel();
			return true;
		case "mode":
			if (!actions.openMode) return refuse("No permission modes to choose from here");
			actions.openMode();
			return true;
		case "effort": {
			if (!actions.setEffort) return refuse("Effort can't be changed until the agent is connected");
			const level = findEffort(actions.efforts, argument);
			if (!level) return false;
			actions.setEffort(level.id);
			return true;
		}
		case "stop":
			if (!actions.running || !actions.stop) return refuse("Nothing to stop");
			actions.stop();
			return true;
		case "task":
			if (!actions.addTask) return refuse("Open a project to add tasks");
			if (!argument) return refuse("Add a title: /task <title>");
			actions.addTask(argument);
			return true;
		case "note":
			if (!actions.addNote) return refuse("Open a project to add notes");
			if (!argument) return refuse("Add the note's text: /note <text>");
			actions.addNote(argument);
			return true;
		default:
			return false;
	}
}

/** Add a task to a project's backlog, with a toast either way. */
export async function addBoardTask(input: {
	token: string | null;
	project: string | null | undefined;
	title: string;
	/** The board to refresh, and to open the task from the toast. */
	workspace: { refreshTasks: () => void; openTask: (number: number) => void };
}): Promise<void> {
	if (!input.token) {
		refuse("Sign in to add tasks");
		return;
	}
	if (!input.project) {
		refuse("Open a project to add tasks");
		return;
	}
	try {
		const task = await projectsService.createTask(input.token, input.project, {
			title: input.title,
			status: "backlog",
		});
		input.workspace.refreshTasks();
		notify({
			title: `Added ${task.key} to ${TASK_STATUS_LABELS[task.status]}`,
			action: { label: "Open", run: () => input.workspace.openTask(task.number) },
		});
	} catch (cause) {
		refuse(cause instanceof Error ? cause.message : "Could not add the task");
	}
}
