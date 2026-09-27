import { useLocation, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { Loading, Show } from "solid-js";

import {
	BoardIcon,
	Button,
	ChatIcon,
	FileIcon,
	IconButton,
	MenuIcon,
	NoteIcon,
	PlusIcon,
	Row,
	Segmented,
	SidebarIcon,
	Spacer,
	Text,
} from "@/kit";
import { useWorkspace } from "@/modules/projects";

import { useShell } from "../context/shell-context";

// Screens without tabs of their own are named in the bar.
const SECTION_TITLES: [prefix: string, title: string][] = [
	["/chat", "Chat"],
	["/terminal", "Terminal"],
	["/settings", "Settings"],
];

type View = "chat" | "files" | "notes" | "board";

/** The part of a project the URL is on, or null outside a project. */
function useProjectView(): () => View | null {
	const location = useLocation();
	return () => {
		const section = location.pathname.split("/")[1];
		return section === "chat" || section === "files" || section === "notes" || section === "board"
			? section
			: null;
	};
}

/** Where you are when a screen has no tabs: the board's project and size, or the section. */
function Heading(): JSX.Element {
	const workspace = useWorkspace();
	const location = useLocation();
	const section = () =>
		SECTION_TITLES.find(([prefix]) => location.pathname.startsWith(prefix))?.[1] ?? null;
	// A project's Files and Notes pages are named after the project, like its board.
	const projectPage = () =>
		location.pathname.startsWith("/files/") || location.pathname.startsWith("/notes/")
			? (workspace.currentProject()?.name ?? null)
			: null;

	return (
		<Show
			when={!section() && workspace.activeSlug()}
			fallback={
				<Text as="h1" tone="strong" weight="medium" truncate class="px-1.5">
					{section() ?? projectPage() ?? "Grid"}
				</Text>
			}
		>
			<Loading fallback={<span />}>
				<Row gap={2} class="px-1.5">
					<Text as="h1" tone="strong" weight="medium" truncate>
						{workspace.activeProject()?.name ?? "Board"}
					</Text>
					<Text
						as="span"
						size="caption"
						tone="subtle"
						tabular
						class="hidden shrink-0 whitespace-nowrap sm:inline"
					>
						{workspace.tasks().length} task{workspace.tasks().length === 1 ? "" : "s"}
					</Text>
				</Row>
			</Loading>
		</Show>
	);
}

/** A project's views, side by side in the bar: its threads, files, notes and board. */
function ProjectViews(props: { compact?: boolean }): JSX.Element {
	const workspace = useWorkspace();
	const navigate = useNavigate();
	const view = useProjectView();

	return (
		<Show when={view() ? workspace.currentSlug() : null}>
			{(project) => (
				<Segmented<View>
					label="Project views"
					iconsOnly={props.compact}
					value={view() ?? "chat"}
					options={[
						{ value: "chat", label: "Threads", icon: <ChatIcon size="sm" /> },
						{ value: "files", label: "Files", icon: <FileIcon size="sm" /> },
						{ value: "notes", label: "Notes", icon: <NoteIcon size="sm" /> },
						{ value: "board", label: "Board", icon: <BoardIcon size="sm" /> },
					]}
					onChange={(next) =>
						navigate(next === "chat" ? workspace.projectHref(project()) : `/${next}/${project()}`)
					}
				/>
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
						icon={<PlusIcon size="sm" />}
						aria-haspopup="dialog"
						onClick={() => workspace.setNewTaskOpen(true)}
					>
						New task
					</Button>
				}
			>
				<IconButton
					label="New task"
					aria-haspopup="dialog"
					onClick={() => workspace.setNewTaskOpen(true)}
				>
					<PlusIcon size="lg" />
				</IconButton>
			</Show>
		</Show>
	);
}

/**
 * Desktop title bar: the sidebar toggle, the screen's tabs (or its name), then the project's
 * views and the screen's action.
 */
export function TitleBar(): JSX.Element {
	const shell = useShell();

	return (
		<header class="flex h-12 shrink-0 select-none items-center gap-2 border-line border-b px-2">
			<IconButton
				size="sm"
				label={shell.collapsed() ? "Show sidebar" : "Hide sidebar"}
				onClick={() => shell.toggleCollapsed()}
			>
				<SidebarIcon />
			</IconButton>
			<div class="flex min-w-0 flex-1 items-center overflow-x-auto [scrollbar-width:none]">
				<Show when={shell.tabs()} fallback={<Heading />}>
					{(tabs) => <>{tabs()()}</>}
				</Show>
			</div>
			<Row gap={2} class="shrink-0">
				<ProjectViews />
				<Action />
			</Row>
		</header>
	);
}

/** Phone title bar: the menu, the screen's tabs (or its name), and its action in thumb reach. */
export function TopBar(): JSX.Element {
	const shell = useShell();
	const location = useLocation();

	return (
		<header class="z-30 shrink-0 border-line border-b bg-surface pt-safe">
			<Row gap={1} class="h-12 px-1.5">
				<IconButton
					label="Open navigation"
					aria-haspopup="dialog"
					onClick={() => shell.setDrawerOpen(true)}
				>
					<MenuIcon size="lg" />
				</IconButton>
				<div class="flex min-w-0 flex-1 items-center overflow-x-auto [scrollbar-width:none]">
					<Show when={shell.tabs()} fallback={<Heading />}>
						{(tabs) => <>{tabs()()}</>}
					</Show>
				</div>
				<Spacer />
				{/* In a chat the phone header is the title alone; the drawer reaches the rest. */}
				<Show when={!location.pathname.startsWith("/chat")}>
					<ProjectViews compact />
				</Show>
				<Action compact />
			</Row>
		</header>
	);
}
