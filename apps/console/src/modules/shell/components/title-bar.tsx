import { useLocation, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { Loading, Show } from "solid-js";

import { EditIcon, IconButton, MenuIcon, Row, SidebarIcon, Text } from "@/kit";
import { useWorkspace } from "@/modules/projects";

import { useShell } from "../context/shell-context";

import { PROJECT_PAGE, ProjectSwitcher } from "./project-switcher";

// Screens without tabs of their own are named in the bar.
const SECTION_TITLES: [prefix: string, title: string][] = [
	["/chat", "Chat"],
	["/terminal", "Terminal"],
	["/settings", "Settings"],
];

/**
 * Where you are when a screen has no tabs: a project's page (board, files, pull requests, notes)
 * is titled by its project, which switches to another project's same page; others by section.
 */
function Heading(): JSX.Element {
	const workspace = useWorkspace();
	const location = useLocation();
	const section = () =>
		SECTION_TITLES.find(([prefix]) => location.pathname.startsWith(prefix))?.[1] ?? null;
	const projectPage = () => !section() && PROJECT_PAGE.test(location.pathname);

	return (
		<Show
			when={projectPage()}
			fallback={
				<Text as="h1" tone="strong" weight="medium" truncate class="px-1.5">
					{section() ?? "Grid"}
				</Text>
			}
		>
			<Loading fallback={<span />}>
				<Row gap={2} class="min-w-0">
					<h1 class="min-w-0">
						<ProjectSwitcher />
					</h1>
					<Show when={workspace.activeSlug()}>
						<Text
							as="span"
							size="caption"
							tone="subtle"
							tabular
							class="hidden shrink-0 whitespace-nowrap sm:inline"
						>
							{workspace.tasks().length} task{workspace.tasks().length === 1 ? "" : "s"}
						</Text>
					</Show>
				</Row>
			</Loading>
		</Show>
	);
}

/**
 * The phone bar's one action, in thumb reach and the same on every screen: a new chat. A screen's
 * own actions (a new task, a new note) sit in its pane header.
 */
function PhoneAction(): JSX.Element {
	const workspace = useWorkspace();
	const navigate = useNavigate();

	return (
		<IconButton
			label="New chat"
			onClick={() => {
				const slug = workspace.currentSlug();
				navigate(slug ? `/chat/${slug}` : "/chat");
			}}
		>
			<EditIcon />
		</IconButton>
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
