import { useLocation, useMatch, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import {
	createContext,
	createEffect,
	createMemo,
	createSignal,
	onSettled,
	untrack,
	useContext,
} from "solid-js";

import { useAuth } from "@/modules/auth";

import { foldersService } from "../services/folders.service";
import { projectsService } from "../services/projects.service";
import type { Project, Task, TaskOwnerKind, TaskStatus } from "../types/project.types";

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
	/** What a new task starts with: the lane it was added from, say. */
	newTaskDefaults: () => NewTaskDefaults;
	/** Open the new-task sheet, optionally starting in a status or with an owner. */
	openNewTask: (defaults?: NewTaskDefaults) => void;
	/**
	 * The project everything else is about: the one the URL names (board or chat), else the last
	 * one used, else the first. Board, Chat and a new terminal all follow it.
	 */
	currentSlug: () => string | null;
	currentProject: () => Project | null;
	/** Re-read the project list, e.g. after adding one. */
	refreshProjects: () => void;
	/** Each project's folder on this machine (from the runner); empty when the runner is down. */
	folders: () => Record<string, string>;
	refreshFolders: () => void;
	/** The "Add project" sheet, opened from any "+" in the navigation. */
	addProjectOpen: () => boolean;
	setAddProjectOpen: (open: boolean) => void;
	/** The "Choose folder" sheet for one project, or null. */
	choosingFolderFor: () => string | null;
	chooseFolderFor: (slug: string | null) => void;
	/**
	 * Where a project opens: its last chat, else a new one. Projects are where the chats live, so
	 * picking one never lands on the board.
	 */
	projectHref: (slug: string) => string;
	/** Remember the chat open in a project, so coming back to the project reopens it. */
	rememberChat: (slug: string, id: string | null) => void;
	/** The rename or remove dialog for one project, or null. */
	projectAction: () => ProjectAction | null;
	setProjectAction: (action: ProjectAction | null) => void;
	renameProject: (slug: string, name: string) => Promise<void>;
	/** Save how a project is drawn: its icon and colour (null for the defaults). */
	styleProject: (
		slug: string,
		look: { icon: string | null; color: string | null },
	) => Promise<void>;
	/** Archive the project: it leaves the console; its folder and chats are untouched. */
	removeProject: (slug: string) => Promise<void>;
};

export type ProjectAction = { kind: "rename" | "remove" | "customize"; slug: string };

export type NewTaskDefaults = {
	status?: TaskStatus;
	ownerKind?: TaskOwnerKind | null;
	ownerName?: string | null;
};

const lastChatKey = (slug: string) => `grid.chat.last.${slug}`;

const CURRENT_KEY = "grid.project";

function rememberedProject(): string | null {
	try {
		return localStorage.getItem(CURRENT_KEY);
	} catch {
		return null;
	}
}

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
	const filesMatch = useMatch(() => "/files/:slug");
	// Bumped after every write so the task read re-runs; the dependency stays visible in the memo.
	const [revision, setRevision] = createSignal(0);
	const [newTaskOpen, setNewTaskOpen] = createSignal(false);
	const [newTaskDefaults, setNewTaskDefaults] = createSignal<NewTaskDefaults>({});
	// Chat pages are per project too: `/chat/:slug` and `/chat/:slug/:id`.
	const chatMatch = useMatch(() => "/chat/:slug/*");
	const [projectsRevision, setProjectsRevision] = createSignal(0);
	const [foldersRevision, setFoldersRevision] = createSignal(0);
	const [addProjectOpen, setAddProjectOpen] = createSignal(false);
	const [choosingFolderFor, chooseFolderFor] = createSignal<string | null>(null);
	const [remembered, setRemembered] = createSignal(rememberedProject());

	// Coming back to the app (switching back to it, unlocking the phone, the network returning)
	// re-reads the board, so what shows is current without a manual reload. A quick glance away
	// does not: the board was just read.
	onSettled(() => {
		let hiddenAt = 0;
		const onVisibility = () => {
			if (document.visibilityState === "hidden") {
				hiddenAt = Date.now();
			} else if (hiddenAt && Date.now() - hiddenAt > 30_000) {
				setRevision((n) => n + 1);
			}
		};
		const onOnline = () => setRevision((n) => n + 1);
		document.addEventListener("visibilitychange", onVisibility);
		window.addEventListener("online", onOnline);
		return () => {
			document.removeEventListener("visibilitychange", onVisibility);
			window.removeEventListener("online", onOnline);
		};
	});

	const projects = createMemo(async () => {
		projectsRevision();
		const token = auth.token();
		if (!token) return [];
		// Archived projects have been removed from the console.
		return (await projectsService.list(token)).filter((project) => project.status !== "archived");
	});

	// The task URL is the board URL plus a panel, so both spell the same project.
	const activeSlug = createMemo(() => (taskMatch() ?? boardMatch())?.params.slug ?? null);
	const activeProject = createMemo(
		() => projects().find((project) => project.slug === activeSlug()) ?? null,
	);

	const currentSlug = createMemo(() => {
		const list = projects();
		const known = (slug: string | null | undefined) =>
			slug && list.some((project) => project.slug === slug) ? slug : null;
		return (
			known(activeSlug()) ??
			known(filesMatch()?.params.slug) ??
			known(chatMatch()?.params.slug) ??
			known(remembered()) ??
			list[0]?.slug ??
			null
		);
	});
	const currentProject = createMemo(
		() => projects().find((project) => project.slug === currentSlug()) ?? null,
	);
	createEffect(currentSlug, (slug) => {
		if (!slug) return;
		setRemembered(slug);
		try {
			localStorage.setItem(CURRENT_KEY, slug);
		} catch {
			// Not remembered; the URL still says which project is open.
		}
	});

	// Folder links live with the runner on this machine; without it they are simply unknown.
	const folders = createMemo(async () => {
		foldersRevision();
		const token = auth.token();
		if (!token) return {};
		return foldersService.projectFolders(token).catch(() => ({}));
	});

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

	const [projectAction, setProjectAction] = createSignal<ProjectAction | null>(null);

	function projectHref(slug: string): string {
		let last: string | null = null;
		try {
			last = localStorage.getItem(lastChatKey(slug));
		} catch {
			// Nothing remembered; the project opens on a new chat.
		}
		return last ? `/chat/${slug}/${last}` : `/chat/${slug}`;
	}

	function rememberChat(slug: string, id: string | null): void {
		try {
			if (id) localStorage.setItem(lastChatKey(slug), id);
			else localStorage.removeItem(lastChatKey(slug));
		} catch {
			// Not remembered; the project opens on a new chat next time.
		}
	}

	async function renameProject(slug: string, name: string): Promise<void> {
		const token = untrack(auth.token);
		if (!token) return;
		await projectsService.update(token, slug, { name });
		setProjectsRevision((n) => n + 1);
	}

	async function styleProject(
		slug: string,
		look: { icon: string | null; color: string | null },
	): Promise<void> {
		const token = untrack(auth.token);
		if (!token) return;
		await projectsService.update(token, slug, look);
		setProjectsRevision((n) => n + 1);
	}

	async function removeProject(slug: string): Promise<void> {
		const token = untrack(auth.token);
		if (!token) return;
		await projectsService.update(token, slug, { status: "archived" });
		rememberChat(slug, null);
		const next = untrack(projects).find((project) => project.slug !== slug);
		setProjectsRevision((n) => n + 1);
		// Leaving the removed project: open the next one, or the empty start.
		if (untrack(currentSlug) === slug) navigate(next ? projectHref(next.slug) : "/chat");
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
		setNewTaskOpen: (open) => {
			if (open) setNewTaskDefaults({});
			setNewTaskOpen(open);
		},
		newTaskDefaults,
		openNewTask: (defaults = {}) => {
			setNewTaskDefaults(defaults);
			setNewTaskOpen(true);
		},
		currentSlug,
		currentProject,
		refreshProjects: () => setProjectsRevision((n) => n + 1),
		folders,
		refreshFolders: () => setFoldersRevision((n) => n + 1),
		addProjectOpen,
		setAddProjectOpen,
		choosingFolderFor,
		chooseFolderFor,
		projectHref,
		rememberChat,
		projectAction,
		setProjectAction,
		renameProject,
		styleProject,
		removeProject,
	};

	return <WorkspaceContext value={state}>{props.children}</WorkspaceContext>;
}

/** Throws `ContextNotFoundError` outside a `WorkspaceProvider`: the context has no default. */
export function useWorkspace(): WorkspaceState {
	return useContext(WorkspaceContext);
}
