import { useLocation } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { Loading, Show } from "solid-js";

import { useWorkspace } from "@/modules/projects";
import {
	BoardIcon,
	Button,
	ChatIcon,
	FileIcon,
	IconButton,
	MenuIcon,
	NoteIcon,
	PlusIcon,
	SidebarIcon,
} from "@/ui";

import { useShell } from "../context/shell-context";

// Screens without tabs of their own are named in the bar.
const SECTION_TITLES: [prefix: string, title: string][] = [
	["/chat", "Chat"],
	["/terminal", "Terminal"],
	["/settings", "Settings"],
];

function useSection(): () => string | null {
	const location = useLocation();
	return () => SECTION_TITLES.find(([prefix]) => location.pathname.startsWith(prefix))?.[1] ?? null;
}

/** Where you are when a screen has no tabs: the board's project and size, or the section. */
function Heading(): JSX.Element {
	const workspace = useWorkspace();
	const section = useSection();
	const location = useLocation();
	// A project's Files and Notes pages are named after the project, like its board.
	const projectPage = () =>
		location.pathname.startsWith("/files/") || location.pathname.startsWith("/notes/")
			? (workspace.currentProject()?.name ?? null)
			: null;

	return (
		<Show
			when={!section() && workspace.activeSlug()}
			fallback={
				<h1 class="truncate px-1.5 font-medium text-ui">{section() ?? projectPage() ?? "Grid"}</h1>
			}
		>
			<Loading fallback={<span />}>
				<div class="flex min-w-0 items-center gap-2 px-1.5">
					<BoardIcon class="size-4 shrink-0 text-ink/45" />
					<h1 class="truncate font-medium text-ui">{workspace.activeProject()?.name ?? "Board"}</h1>
					<span class="shrink-0 text-ink/45 text-ui-xs tabular-nums">
						{workspace.tasks().length} task{workspace.tasks().length === 1 ? "" : "s"}
					</span>
				</div>
			</Loading>
		</Show>
	);
}

const VIEW =
	"focus-ring inline-flex h-6.5 items-center gap-1.5 rounded-md px-2 text-ink/55 text-ui-sm hover:text-ink aria-[current=page]:bg-selection aria-[current=page]:text-ink pointer-coarse:h-10 pointer-coarse:px-2.5";

/**
 * A project's two views, side by side in the bar: its threads and its board. Shown wherever a
 * project is open (chat or board).
 */
function ProjectViews(props: { compact?: boolean }): JSX.Element {
	const workspace = useWorkspace();
	const location = useLocation();
	const slug = () =>
		location.pathname.startsWith("/chat/") ||
		location.pathname.startsWith("/board/") ||
		location.pathname.startsWith("/files/") ||
		location.pathname.startsWith("/notes/")
			? workspace.currentSlug()
			: null;
	const onBoard = () => location.pathname.startsWith("/board/");
	const onFiles = () => location.pathname.startsWith("/files/");
	const onNotes = () => location.pathname.startsWith("/notes/");

	return (
		<Show when={slug()}>
			{(project) => (
				<nav aria-label="Project views" class="flex items-center gap-0.5 rounded-lg bg-ink/5 p-0.5">
					<a
						href={workspace.projectHref(project())}
						aria-current={onBoard() || onFiles() || onNotes() ? undefined : "page"}
						class={VIEW}
						title="Threads"
					>
						<ChatIcon class="size-3.5" />
						<span class={props.compact ? "sr-only" : ""}>Threads</span>
					</a>
					<a
						href={`/files/${project()}`}
						aria-current={onFiles() ? "page" : undefined}
						class={VIEW}
						title="Files"
					>
						<FileIcon class="size-3.5" />
						<span class={props.compact ? "sr-only" : ""}>Files</span>
					</a>
					<a
						href={`/notes/${project()}`}
						aria-current={onNotes() ? "page" : undefined}
						class={VIEW}
						title="Notes"
					>
						<NoteIcon class="size-3.5" />
						<span class={props.compact ? "sr-only" : ""}>Notes</span>
					</a>
					<a
						href={`/board/${project()}`}
						aria-current={onBoard() ? "page" : undefined}
						class={VIEW}
						title="Board"
					>
						<BoardIcon class="size-3.5" />
						<span class={props.compact ? "sr-only" : ""}>Board</span>
					</a>
				</nav>
			)}
		</Show>
	);
}

/** The screen's own action at the right of the bar: a new task on the board. */
function Action(props: { compact?: boolean }): JSX.Element {
	const workspace = useWorkspace();

	return (
		<Show when={workspace.activeSlug()}>
			<Show
				when={props.compact}
				fallback={
					<Button
						variant="primary"
						size="sm"
						aria-haspopup="dialog"
						onClick={() => workspace.setNewTaskOpen(true)}
					>
						<PlusIcon class="size-3.5" />
						New task
					</Button>
				}
			>
				<IconButton
					label="New task"
					aria-haspopup="dialog"
					onClick={() => workspace.setNewTaskOpen(true)}
				>
					<PlusIcon class="size-5" />
				</IconButton>
			</Show>
		</Show>
	);
}

/**
 * Desktop title bar, 40px: the screen's tabs (or its name) on the left, the project's views and
 * the screen's action on the right.
 */
export function TitleBar(): JSX.Element {
	const shell = useShell();

	return (
		<header class="flex h-10 shrink-0 select-none items-stretch border-stroke border-b">
			<Show when={shell.collapsed()}>
				<div class="flex items-center pl-1.5">
					<button
						type="button"
						title="Show sidebar"
						class="focus-ring grid size-6.5 place-items-center rounded-md text-ink/50 hover:bg-ink/10 hover:text-ink"
						onClick={() => shell.toggleCollapsed()}
					>
						<SidebarIcon class="size-3.5" />
					</button>
				</div>
			</Show>
			<div class="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto overscroll-none pr-2.5 pl-1.5 [scrollbar-width:none]">
				<Show when={shell.tabs()} fallback={<Heading />}>
					{(tabs) => <>{tabs()()}</>}
				</Show>
			</div>
			<div class="min-w-0 flex-1" />
			<div class="flex shrink-0 items-center gap-2 pr-2">
				<ProjectViews />
				<Action />
			</div>
		</header>
	);
}

/** Phone title bar: the menu, the screen's tabs (or its name), and its action in thumb reach. */
export function TopBar(): JSX.Element {
	const shell = useShell();
	const location = useLocation();

	return (
		<header class="glass z-30 shrink-0 border-stroke border-b pt-[env(safe-area-inset-top)]">
			<div class="flex h-12 items-center gap-1 px-1.5">
				<IconButton
					label="Open navigation"
					aria-haspopup="dialog"
					onClick={() => shell.setDrawerOpen(true)}
				>
					<MenuIcon class="size-5" />
				</IconButton>
				<div class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
					<Show when={shell.tabs()} fallback={<Heading />}>
						{(tabs) => <>{tabs()()}</>}
					</Show>
				</div>
				{/* In a chat the phone header is the title alone; the drawer reaches the board. */}
				<Show when={!location.pathname.startsWith("/chat")}>
					<ProjectViews compact />
				</Show>
				<Action compact />
			</div>
		</header>
	);
}
