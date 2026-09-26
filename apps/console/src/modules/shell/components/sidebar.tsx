import { useLocation } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { Loading, Show } from "solid-js";

import {
	CloseIcon,
	EditIcon,
	IconButton,
	Kbd,
	NavButton,
	NavLink,
	NavSection,
	PlusIcon,
	Row,
	SearchIcon,
	Skeleton,
	Stack,
	TerminalIcon,
} from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";
import { useWorkspace } from "@/modules/projects";
import { WorkspaceSwitcher } from "@/modules/workspaces";

import { useShell } from "../context/shell-context";

import { AccountMenu } from "./account-menu";
import { ProjectTree } from "./project-tree";

/**
 * The navigation: the workspace and its switcher, the everyday destinations, the workspace's
 * projects with their pages and threads, and who is signed in. The same component is the
 * desktop column and the phone drawer.
 */
export function Sidebar(props: { onClose?: () => void }): JSX.Element {
	const shell = useShell();
	const workspace = useWorkspace();
	const location = useLocation();
	const newChat = () => {
		const slug = workspace.currentSlug();
		return slug ? `/chat/${slug}` : "/chat";
	};

	return (
		<nav aria-label="Navigation" class="flex h-full min-h-0 flex-col">
			<Row gap={1} class="h-12 shrink-0 px-2 pointer-coarse:h-14">
				<WorkspaceSwitcher />
				<Show
					when={props.onClose}
					fallback={
						<IconButton label="Search" size="sm" onClick={() => shell.setPaletteOpen(true)}>
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
							size="xs"
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
