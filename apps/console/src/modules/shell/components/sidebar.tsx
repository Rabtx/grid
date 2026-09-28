import { useLocation } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, For, Loading, Show } from "solid-js";

import {
	BoardIcon,
	ClockIcon,
	CloseIcon,
	Count,
	EditIcon,
	FileIcon,
	IconButton,
	InboxIcon,
	Kbd,
	NavButton,
	NavLink,
	NavSection,
	NoteIcon,
	PlusIcon,
	PullRequestIcon,
	Row,
	SearchIcon,
	Skeleton,
	Stack,
	TerminalIcon,
} from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";
import { useAuth } from "@/modules/auth";
import { inboxStore } from "@/modules/inbox";
import { useWorkspace } from "@/modules/projects";
import { WorkspaceSwitcher } from "@/modules/workspaces";

import { useShell } from "../context/shell-context";

import { AccountMenu } from "./account-menu";
import { ProjectTree } from "./project-tree";

/** The pages every project has, listed once at the top rather than under each project. */
const PROJECT_PAGES = [
	{ path: "board", label: "Board", icon: () => <BoardIcon /> },
	{ path: "files", label: "Files", icon: () => <FileIcon /> },
	{ path: "pulls", label: "Pull requests", icon: () => <PullRequestIcon /> },
	{ path: "notes", label: "Notes", icon: () => <NoteIcon /> },
] as const;

/**
 * The navigation: the workspace and its switcher, the everyday destinations (a project's board,
 * files, pull requests and notes among them, for the project you are in), the workspace's
 * projects with their threads, and who is signed in. The same component is the
 * desktop column and the phone drawer.
 */
export function Sidebar(props: { onClose?: () => void }): JSX.Element {
	const shell = useShell();
	const workspace = useWorkspace();
	const auth = useAuth();
	const location = useLocation();
	const newChat = () => {
		const slug = workspace.currentSlug();
		return slug ? `/chat/${slug}` : "/chat";
	};
	// A project's pages open on the project you are in; each page switches project from its bar.
	const pageHref = (path: string) => {
		const slug = workspace.currentSlug();
		return slug ? `/${path}/${slug}` : "/board";
	};
	// The count of what is waiting, which the Inbox and its own actions keep true. Read once per
	// sign-in: push already tells someone about a new item, and a stale count is not worth a poll.
	createEffect(
		() => auth.token(),
		(token) => {
			if (token) void inboxStore.count(token);
		},
	);

	return (
		<nav aria-label="Navigation" class="flex h-full min-h-0 flex-col">
			<Row gap={1} class="h-12 shrink-0 px-2 pointer-coarse:h-14">
				<WorkspaceSwitcher />
				<Show
					when={props.onClose}
					fallback={
						<IconButton
							label="Search"
							shortcut="Mod K"
							size="sm"
							onClick={() => shell.setPaletteOpen(true)}
						>
							<SearchIcon />
						</IconButton>
					}
				>
					{(close) => (
						<IconButton label="Close" onClick={() => close()()}>
							<CloseIcon size="lg" />
						</IconButton>
					)}
				</Show>
			</Row>

			<Stack gap={0.5} class="shrink-0 px-2 pb-4">
				<Loading fallback={<Skeleton class="h-8" />}>
					<NavLink
						href={workspaceHref(newChat())}
						icon={<EditIcon />}
						label="New chat"
						current={location.pathname === newChat()}
					/>
				</Loading>
				<Show when={props.onClose}>
					<NavButton
						icon={<SearchIcon />}
						label="Search"
						onClick={() => shell.setPaletteOpen(true)}
					/>
				</Show>
				<NavLink
					href={workspaceHref("/inbox")}
					icon={<InboxIcon />}
					label="Inbox"
					current={location.pathname.startsWith("/inbox")}
					trailing={
						<Show when={inboxStore.unread() > 0}>
							<Count>{inboxStore.unread() > 99 ? "99+" : inboxStore.unread()}</Count>
						</Show>
					}
				/>
				<NavLink
					href={workspaceHref("/automations")}
					icon={<ClockIcon />}
					label="Automations"
					current={location.pathname.startsWith("/automations")}
				/>
				<For each={PROJECT_PAGES}>
					{(page) => (
						<NavLink
							href={workspaceHref(pageHref(page.path))}
							icon={page.icon()}
							label={page.label}
							current={location.pathname.startsWith(`/${page.path}/`)}
						/>
					)}
				</For>
				<NavLink
					href={workspaceHref("/terminal")}
					icon={<TerminalIcon />}
					label="Terminal"
					current={location.pathname.startsWith("/terminal")}
					trailing={
						<Show when={!props.onClose}>
							<Kbd>g t</Kbd>
						</Show>
					}
				/>
			</Stack>

			<div class="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-2 pb-2">
				<NavSection
					label="Projects"
					action={
						<IconButton
							size="sm"
							label="Open a folder as a project"
							onClick={() => workspace.setAddProjectOpen(true)}
						>
							<PlusIcon size="sm" />
						</IconButton>
					}
				>
					<Loading
						fallback={
							<Stack gap={1}>
								<Skeleton class="h-8" />
								<Skeleton class="h-8" />
							</Stack>
						}
					>
						<ProjectTree />
					</Loading>
				</NavSection>
			</div>

			<div class="shrink-0 p-2 pb-safe">
				<AccountMenu />
			</div>
		</nav>
	);
}
