import { useLocation, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { Loading, Show } from "solid-js";

import {
	CloseIcon,
	IconButton,
	LaptopIcon,
	MachineCard,
	NavSection,
	PanelHeader,
	PlusIcon,
	SearchIcon,
	Skeleton,
	Stack,
} from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";
import { runnerUp } from "@/lib/runner-health";
import { useWorkspace } from "@/modules/projects";
import { WorkspaceSwitcher } from "@/modules/workspaces";

import { useShell } from "../context/shell-context";

import { ProjectTree } from "./project-tree";

// The panel is titled by the rail destination you are on, as the Figma panel header is.
const SECTIONS: [prefix: string, title: string][] = [
	["/home", "Home"],
	["/inbox", "Inbox"],
	["/chat", "Threads"],
	["/board", "Board"],
	["/files", "Files"],
	["/notes", "Notes"],
	["/terminal", "Terminal"],
	["/pulls", "Pull requests"],
	["/automations", "Automations"],
	["/settings", "Settings"],
];

export function sectionTitle(path: string): string {
	return (
		SECTIONS.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))?.[1] ?? "Grid"
	);
}

/** The panel's default body: the workspace's projects, each with its threads. */
function ProjectsBody(): JSX.Element {
	const workspace = useWorkspace();
	return (
		<div class="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-2">
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
	);
}

/**
 * The panel beside the rail (the Figma Grid/Sidebar/Panel): the section's name with search and a
 * new thread, the workspace and its projects with their threads, and this machine at the foot.
 * The same component is the desktop column and, beside the rail, the phone drawer.
 */
export function Sidebar(props: { onClose?: () => void }): JSX.Element {
	const shell = useShell();
	const workspace = useWorkspace();
	const location = useLocation();
	const navigate = useNavigate();
	const newThread = () => {
		const slug = workspace.currentSlug();
		navigate(slug ? `/chat/${slug}` : "/chat");
	};
	return (
		<nav aria-label="Workspace" class="flex h-full min-h-0 flex-col">
			<PanelHeader
				title={sectionTitle(location.pathname)}
				actions={
					<Show
						when={props.onClose || !shell.panelActions()}
						fallback={<>{shell.panelActions()?.()}</>}
					>
						<IconButton
							label="Search"
							shortcut="Mod K"
							size="sm"
							onClick={() => shell.setPaletteOpen(true)}
						>
							<SearchIcon />
						</IconButton>
						<Show
							when={props.onClose}
							fallback={
								<IconButton label="New thread" size="sm" onClick={newThread}>
									<PlusIcon />
								</IconButton>
							}
						>
							{(close) => (
								<IconButton label="Close" size="sm" onClick={() => close()()}>
									<CloseIcon />
								</IconButton>
							)}
						</Show>
					</Show>
				}
			/>

			<div class="shrink-0 px-2 pt-2">
				<WorkspaceSwitcher />
			</div>
			<Show when={shell.panel()} fallback={<ProjectsBody />}>
				{(panel) => (
					<div class="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-2">
						{panel()()}
					</div>
				)}
			</Show>
			<div class="shrink-0 p-2 pb-safe">
				{/* The runner this console drives: whether it is online, and the way to every machine. */}
				<MachineCard
					href={workspaceHref("/settings/environments")}
					name="Runner"
					detail={runnerUp() ? "Runner online" : "Runner offline"}
					online={runnerUp()}
					icon={<LaptopIcon />}
				/>
			</div>
		</nav>
	);
}
