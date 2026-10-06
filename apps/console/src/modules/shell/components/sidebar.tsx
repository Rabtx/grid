import { useLocation, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { Loading, Show } from "solid-js";

import {
	CloseIcon,
	EditIcon,
	IconButton,
	PanelHeader,
	PlusIcon,
	SearchIcon,
	Skeleton,
	Stack,
} from "@/kit";
import { useWorkspace } from "@/modules/projects";

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
	["/terminal", "Terminals"],
	["/pulls", "Pull requests"],
	["/ship", "Ship"],
	["/operate", "Operate"],
	["/automations", "Automations"],
	["/settings", "Settings"],
	["/machines", "Machines"],
	["/agents", "Agents"],
];

export function sectionTitle(path: string): string {
	return (
		SECTIONS.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))?.[1] ?? "Grid"
	);
}

/**
 * The panel's default body: the workspace's projects, each with its threads. The panel header
 * already names the section, so the list starts clean — no second title under it.
 */
function ProjectsBody(): JSX.Element {
	return (
		<div class="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-2">
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
		</div>
	);
}

/**
 * The panel beside the rail (the Figma Grid/Sidebar/Panel): one title — the section's name — with
 * search, adding a project and a new thread, then the workspace's projects with their threads (or
 * the section's own panel). The workspace is switched from the account menu; machines live under
 * the rail's Machines. The same component is the desktop column and, beside the rail, the phone
 * drawer.
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
						{/* Adding a project belongs to the projects list, so it sits in the header that
						    already names it rather than in a label the list no longer has. */}
						<Show when={!shell.panel()}>
							<IconButton
								label="Open a folder as a project"
								size="sm"
								onClick={() => workspace.setAddProjectOpen(true)}
							>
								<PlusIcon />
							</IconButton>
						</Show>
						<Show
							when={props.onClose}
							fallback={
								/* Its own glyph, like the phone bar's: a plain + beside the header's
								   + for adding a project would be two identical buttons. */
								<IconButton label="New thread" size="sm" onClick={newThread}>
									<EditIcon />
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

			<Show when={shell.panel()} fallback={<ProjectsBody />}>
				{(panel) => (
					<div class="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-2">
						{panel()()}
					</div>
				)}
			</Show>
		</nav>
	);
}
