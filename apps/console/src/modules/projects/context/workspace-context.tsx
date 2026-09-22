import { useMatch } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createContext, createMemo, createSignal, useContext } from "solid-js";

import { useAuth } from "@/modules/auth";

import { projectsService } from "../services/projects.service";
import type { Project, Task } from "../types/project.types";

type WorkspaceState = {
	projects: () => Project[];
	/** Slug from the `/board/:slug` URL, or null on any other route. */
	activeSlug: () => string | null;
	/** The project the URL points at; null when there is no slug or it matches nothing. */
	activeProject: () => Project | null;
	tasks: () => Task[];
	/** Re-read the active project's tasks after a write. */
	refreshTasks: () => void;
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
	const boardMatch = useMatch(() => "/board/:slug");
	// Bumped after every write so the task read re-runs; the dependency stays visible in the memo.
	const [revision, setRevision] = createSignal(0);
	const [newTaskOpen, setNewTaskOpen] = createSignal(false);

	const projects = createMemo(async () => {
		const token = auth.token();
		if (!token) return [];
		return projectsService.list(token);
	});

	const activeSlug = createMemo(() => boardMatch()?.params.slug ?? null);
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

	const state: WorkspaceState = {
		projects,
		activeSlug,
		activeProject,
		tasks,
		refreshTasks: () => setRevision((n) => n + 1),
		newTaskOpen,
		setNewTaskOpen,
	};

	return <WorkspaceContext value={state}>{props.children}</WorkspaceContext>;
}

/** Throws `ContextNotFoundError` outside a `WorkspaceProvider`: the context has no default. */
export function useWorkspace(): WorkspaceState {
	return useContext(WorkspaceContext);
}
