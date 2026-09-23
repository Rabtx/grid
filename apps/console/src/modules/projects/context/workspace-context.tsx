import { useLocation, useMatch, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createContext, createMemo, createSignal, untrack, useContext } from "solid-js";

import { useAuth } from "@/modules/auth";

import { projectsService } from "../services/projects.service";
import type { Project, Task } from "../types/project.types";

type WorkspaceState = {
	projects: () => Project[];
	/** Slug from `/board/:slug` or `/board/:slug/tasks/:number`, or null on any other route. */
	activeSlug: () => string | null;
	/** The project the URL points at; null when there is no slug or it matches nothing. */
	activeProject: () => Project | null;
	tasks: () => Task[];
	/** Re-read the active project's tasks after a write. */
	refreshTasks: () => void;
	/** Task number the URL opens, or null when no task is open. */
	activeTaskNumber: () => number | null;
	/** The open task, looked up in the loaded tasks; null while they load or when none matches. */
	activeTask: () => Task | null;
	/** Open a task over the board, keeping the board's filters. */
	openTask: (number: number) => void;
	/** Leave the panel for the board, keeping the board's filters. */
	closeTask: () => void;
	newTaskOpen: () => boolean;
	setNewTaskOpen: (open: boolean) => void;
};

const WorkspaceContext = createContext<WorkspaceState>();

/**
 * The signed-in workspace: the project list, the project the URL selects, and its tasks.
 *
 * It lives in the root layout so the sidebar, top bar and board read one copy of the data —
 * one request per project switch, and no way for the navigation and the board to disagree
 * about which project is open.
 */
export function WorkspaceProvider(props: { children: JSX.Element }): JSX.Element {
	const auth = useAuth();
	const navigate = useNavigate();
	const location = useLocation();
	// The board, and the same board with one task open over it.
	const boardMatch = useMatch(() => "/board/:slug");
	const taskMatch = useMatch(() => "/board/:slug/tasks/:number");
	// Bumped after every write so the task read re-runs; the dependency stays visible in the memo.
	const [revision, setRevision] = createSignal(0);
	const [newTaskOpen, setNewTaskOpen] = createSignal(false);

	const projects = createMemo(async () => {
		const token = auth.token();
		if (!token) return [];
		return projectsService.list(token);
	});

	// The task URL is the board URL plus a panel, so both spell the same project.
	const activeSlug = createMemo(() => (taskMatch() ?? boardMatch())?.params.slug ?? null);
	const activeProject = createMemo(
		() => projects().find((project) => project.slug === activeSlug()) ?? null,
	);

	const tasks = createMemo(async () => {
		revision();
		const token = auth.token();
		const project = activeProject();
		if (!token || !project) return [];
		return projectsService.listTasks(token, project.slug);
	});

	const activeTaskNumber = createMemo(() => {
		const raw = taskMatch()?.params.number;
		if (raw === undefined) return null;
		const number = Number(raw);
		return Number.isInteger(number) && number > 0 ? number : null;
	});

	const activeTask = createMemo(() => {
		const number = activeTaskNumber();
		if (number === null) return null;
		return tasks().find((task) => task.number === number) ?? null;
	});

	// Opening a task is a URL change, so the open task is linkable and survives a reload.
	// The reads are untracked on purpose: these run from clicks and from the sheet's own close
	// event, which a `Sheet` fires while closing itself from inside an effect.
	function openTask(number: number): void {
		const slug = untrack(activeSlug);
		if (!slug) return;
		const search = untrack(() => location.search);
		navigate(`/board/${slug}/tasks/${number}${search}`, { scroll: false });
	}

	function closeTask(): void {
		const slug = untrack(activeSlug);
		if (!slug) return;
		const search = untrack(() => location.search);
		navigate(`/board/${slug}${search}`, { scroll: false });
	}

	const state: WorkspaceState = {
		projects,
		activeSlug,
		activeProject,
		tasks,
		refreshTasks: () => setRevision((n) => n + 1),
		activeTaskNumber,
		activeTask,
		openTask,
		closeTask,
		newTaskOpen,
		setNewTaskOpen,
	};

	return <WorkspaceContext value={state}>{props.children}</WorkspaceContext>;
}

/** Throws `ContextNotFoundError` outside a `WorkspaceProvider`: the context has no default. */
export function useWorkspace(): WorkspaceState {
	return useContext(WorkspaceContext);
}
