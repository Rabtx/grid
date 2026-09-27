import { useLocation, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { Loading, Show } from "solid-js";

import { EditIcon, IconButton, MenuIcon, PlusIcon, Row, SidebarIcon, Text } from "@/kit";
import { useWorkspace } from "@/modules/projects";

import { useShell } from "../context/shell-context";

// Screens without tabs of their own are named in the bar.
const SECTION_TITLES: [prefix: string, title: string][] = [
	["/chat", "Chat"],
	["/terminal", "Terminal"],
	["/settings", "Settings"],
];

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

/**
 * The phone bar's one action, in thumb reach: a new task on the board, a new chat everywhere
 * else. The project's other pages are a tap away in the drawer.
 */
function PhoneAction(): JSX.Element {
	const workspace = useWorkspace();
	const location = useLocation();
	const navigate = useNavigate();
	const onBoard = () => location.pathname.startsWith("/board/") && workspace.activeSlug();

	return (
		<Show
			when={onBoard()}
			fallback={
				<IconButton
					label="New chat"
					onClick={() => {
						const slug = workspace.currentSlug();
						navigate(slug ? `/chat/${slug}` : "/chat");
					}}
				>
					<EditIcon size="lg" />
				</IconButton>
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
	);
}

/** Desktop title bar: the sidebar toggle, then the screen's tabs (or its name). */
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
		</header>
	);
}

/** Phone title bar: the menu, where you are in the middle, and the screen's one action. */
export function TopBar(): JSX.Element {
	const shell = useShell();

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
				<div class="flex min-w-0 flex-1 items-center justify-center overflow-x-auto [scrollbar-width:none]">
					<Show when={shell.tabs()} fallback={<Heading />}>
						{(tabs) => <>{tabs()()}</>}
					</Show>
				</div>
				<PhoneAction />
			</Row>
		</header>
	);
}
