import { beforeEach, describe, expect, it, vi } from "vitest";

import { addBoardTask, runSlashCommand, type SlashCommandActions } from "./run-slash-command";
import { GRID_COMMANDS, type SlashCommand } from "./slash-commands";

const { notify, createTask } = vi.hoisted(() => ({ notify: vi.fn(), createTask: vi.fn() }));

vi.mock("@/kit", () => ({ notify }));
vi.mock("@/modules/projects", () => ({
	projectsService: { createTask },
	TASK_STATUS_LABELS: { backlog: "Backlog" },
}));

const EFFORTS = [
	{ id: "low", name: "Low" },
	{ id: "medium", name: "Medium" },
	{ id: "high", name: "High" },
];

function command(name: string): SlashCommand {
	const found = GRID_COMMANDS.find((candidate) => candidate.name === name);
	if (!found) throw new Error(`no Grid command named ${name}`);
	return found;
}

function actions(extra: Partial<SlashCommandActions> = {}): SlashCommandActions {
	return {
		running: false,
		efforts: EFFORTS,
		setEffort: vi.fn(),
		...extra,
	};
}

function lastToast(): string | undefined {
	return notify.mock.calls.at(-1)?.[0]?.title;
}

beforeEach(() => {
	notify.mockClear();
	createTask.mockReset();
});

describe("runSlashCommand", () => {
	it("sets an effort named by id or name", () => {
		const setEffort = vi.fn();
		expect(runSlashCommand(command("effort"), "HIGH", actions({ setEffort }))).toBe(true);
		expect(setEffort).toHaveBeenCalledWith("high");
		expect(runSlashCommand(command("effort"), "Medium", actions({ setEffort }))).toBe(true);
		expect(setEffort).toHaveBeenLastCalledWith("medium");
	});

	it("keeps an unknown effort and lists the real levels", () => {
		const setEffort = vi.fn();
		expect(runSlashCommand(command("effort"), "foo", actions({ setEffort }))).toBe(false);
		expect(setEffort).not.toHaveBeenCalled();
		expect(lastToast()).toBe("Unknown effort: foo. Try low, medium, high");
	});

	it("asks for a level when none is given", () => {
		expect(runSlashCommand(command("effort"), "", actions())).toBe(false);
		expect(lastToast()).toBe("Choose an effort: low, medium, high");
	});

	it("says why effort cannot change without a link or levels", () => {
		expect(runSlashCommand(command("effort"), "low", actions({ setEffort: undefined }))).toBe(
			false,
		);
		expect(lastToast()).toBe("Effort can't be changed until the agent is connected");
		expect(runSlashCommand(command("effort"), "low", actions({ efforts: [] }))).toBe(false);
		expect(lastToast()).toBe("This model has no effort levels");
	});

	it("answers /stop while idle instead of sending it", () => {
		const stop = vi.fn();
		expect(runSlashCommand(command("stop"), "", actions({ stop }))).toBe(false);
		expect(stop).not.toHaveBeenCalled();
		expect(lastToast()).toBe("Nothing to stop");
	});

	it("stops a running turn", () => {
		const stop = vi.fn();
		expect(runSlashCommand(command("stop"), "", actions({ running: true, stop }))).toBe(true);
		expect(stop).toHaveBeenCalled();
	});

	it("adds tasks and notes mid-turn", () => {
		const addTask = vi.fn();
		const addNote = vi.fn();
		const running = actions({ running: true, addTask, addNote });
		expect(runSlashCommand(command("task"), "buy milk", running)).toBe(true);
		expect(runSlashCommand(command("note"), "remember this", running)).toBe(true);
		expect(addTask).toHaveBeenCalledWith("buy milk");
		expect(addNote).toHaveBeenCalledWith("remember this");
	});

	it("keeps /task and /note without text or a project, saying why", () => {
		const addTask = vi.fn();
		expect(runSlashCommand(command("task"), "", actions({ addTask }))).toBe(false);
		expect(lastToast()).toBe("Add a title: /task <title>");
		expect(runSlashCommand(command("task"), "buy milk", actions())).toBe(false);
		expect(lastToast()).toBe("Open a project to add tasks");
		expect(runSlashCommand(command("note"), "", actions({ addNote: vi.fn() }))).toBe(false);
		expect(lastToast()).toBe("Add the note's text: /note <text>");
		expect(runSlashCommand(command("note"), "hi", actions())).toBe(false);
		expect(lastToast()).toBe("Open a project to add notes");
		expect(addTask).not.toHaveBeenCalled();
	});

	it("opens a new thread", () => {
		const newThread = vi.fn();
		expect(runSlashCommand(command("new"), "", actions({ newThread }))).toBe(true);
		expect(newThread).toHaveBeenCalled();
	});

	it("says so when this is a new thread already", () => {
		expect(runSlashCommand(command("new"), "", actions())).toBe(true);
		expect(lastToast()).toBe("This is a new thread already");
	});

	it("opens the pickers, or says there is nothing to pick", () => {
		const openModel = vi.fn();
		expect(runSlashCommand(command("model"), "", actions({ openModel }))).toBe(true);
		expect(openModel).toHaveBeenCalled();
		expect(runSlashCommand(command("mode"), "", actions())).toBe(false);
		expect(lastToast()).toBe("No permission modes to choose from here");
	});
});

describe("addBoardTask", () => {
	const workspace = { refreshTasks: vi.fn(), openTask: vi.fn() };

	it("adds the task to the backlog and says so", async () => {
		createTask.mockResolvedValue({ key: "GRID-7", number: 7, status: "backlog" });
		await addBoardTask({ token: "t", project: "alpha", title: "buy milk", workspace });
		expect(createTask).toHaveBeenCalledWith("t", "alpha", { title: "buy milk", status: "backlog" });
		expect(workspace.refreshTasks).toHaveBeenCalled();
		expect(lastToast()).toBe("Added GRID-7 to Backlog");
	});

	it("says why when it cannot add one", async () => {
		await addBoardTask({ token: null, project: "alpha", title: "x", workspace });
		expect(lastToast()).toBe("Sign in to add tasks");
		await addBoardTask({ token: "t", project: null, title: "x", workspace });
		expect(lastToast()).toBe("Open a project to add tasks");
		createTask.mockRejectedValue(new Error("Board is full"));
		await addBoardTask({ token: "t", project: "alpha", title: "x", workspace });
		expect(lastToast()).toBe("Board is full");
	});
});
