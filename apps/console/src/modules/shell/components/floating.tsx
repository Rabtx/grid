import { useLocation } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { For, Loading, Show, untrack } from "solid-js";

import {
	BellIcon,
	CheckIcon,
	ChevronDownIcon,
	FloatingPanel,
	FolderIcon,
	IconButton,
	Menu,
	menuTrigger,
	PlusIcon,
	RailLink,
	Row,
	SearchIcon,
	SettingsIcon,
	SidebarIcon,
	Skeleton,
	Stack,
	Text,
	WorkspaceMark,
} from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";
import { inboxStore } from "@/modules/inbox";
import { useWorkspace } from "@/modules/projects";
import { useWorkspaces } from "@/modules/workspaces";

import { useShell } from "../context/shell-context";

import { AccountMenu } from "./account-menu";
import { ProjectTree } from "./project-tree";
import { VIEWS } from "./rail";
import { sectionTitle } from "./sidebar";
import { Breadcrumb } from "./title-bar";

/**
 * The workspace you are in, as the floating top bar names it: its mark and name, opening the
 * others to move to, a new one, and a folder to open as a project.
 */
function WorkspaceSwitcher(): JSX.Element {
	const workspaces = useWorkspaces();
	const workspace = useWorkspace();
	const name = () => workspaces.current()?.name ?? "Workspace";

	return (
		<Menu
			label="Switch workspace"
			placement="bottom-start"
			width="md:w-60"
			triggerClass={menuTrigger({ size: "sm", class: "-ml-1.5 shrink-0 gap-1.5" })}
			trigger={
				<>
					<WorkspaceMark
						name={name()}
						color={workspaces.current()?.color}
						src={workspaces.current()?.logoUrl}
						size="sm"
					/>
					<Text as="span" tone="strong" weight="medium" truncate>
						{name()}
					</Text>
					<ChevronDownIcon size="sm" />
				</>
			}
			groups={[
				{
					label: "Workspace",
					items: [
						...workspaces.list().map((item) => ({
							id: `ws:${item.slug}`,
							label: item.name,
							icon: (
								<WorkspaceMark name={item.name} color={item.color} src={item.logoUrl} size="xs" />
							),
							trailing: item.slug === workspaces.current()?.slug ? <CheckIcon /> : undefined,
						})),
						{ id: "create", label: "Create workspace", icon: <PlusIcon /> },
					],
				},
				{ items: [{ id: "project", label: "Open a folder as a project", icon: <FolderIcon /> }] },
			]}
			onSelect={(id) => {
				if (id.startsWith("ws:")) {
					const target = workspaces.list().find((item) => `ws:${item.slug}` === id);
					if (target && target.slug !== workspaces.current()?.slug) workspaces.switchTo(target);
				} else if (id === "create") workspaces.setCreateOpen(true);
				else workspace.setAddProjectOpen(true);
			}}
		/>
	);
}

/**
 * The top bar of the floating layout (the Figma Floating sidebar's Top bar): the sidebar's toggle,
 * the workspace, then the screen's tabs or where you are; search, the Inbox and you on the right.
 * No rule under it: the canvas runs on beneath.
 */
export function FloatingTopBar(): JSX.Element {
	const shell = useShell();

	return (
		<header class="flex h-13 shrink-0 select-none items-center gap-3 px-4">
			<IconButton
				variant="bare"
				label={shell.collapsed() ? "Show sidebar" : "Hide sidebar"}
				aria-expanded={shell.collapsed() ? "false" : "true"}
				onClick={() => shell.toggleCollapsed()}
			>
				<SidebarIcon />
			</IconButton>
			<WorkspaceSwitcher />
			<span aria-hidden="true" class="h-4 w-px shrink-0 bg-line" />
			<div class="flex min-w-0 flex-1 items-center overflow-x-auto [scrollbar-width:none]">
				<Show when={shell.tabs()} fallback={<Breadcrumb />}>
					{(tabs) => <>{tabs()()}</>}
				</Show>
			</div>
			<Show when={shell.actions()}>
				{(actions) => <div class="flex shrink-0 items-center gap-2">{actions()()}</div>}
			</Show>
			<Row gap={2} class="shrink-0">
				<IconButton
					variant="bare"
					label="Search"
					shortcut="Mod K"
					onClick={() => shell.setPaletteOpen(true)}
				>
					<SearchIcon />
				</IconButton>
				<RailLink
					href={workspaceHref("/inbox")}
					label="Inbox"
					spoken={inboxStore.unread() > 0 ? `Inbox, ${inboxStore.unread()} unread` : undefined}
					icon={<BellIcon />}
					dot={inboxStore.unread() > 0}
					size="bar"
				/>
				<AccountMenu avatar />
			</Row>
		</header>
	);
}

/** The views row along the card's top: every destination as an icon, the current one raised. */
function ViewsRow(): JSX.Element {
	const workspace = useWorkspace();
	const location = useLocation();
	const at = (prefix: string) =>
		location.pathname === prefix || location.pathname.startsWith(`${prefix}/`);

	return (
		<For each={VIEWS}>
			{(view) => (
				<RailLink
					size="row"
					href={workspaceHref(view.href(workspace.currentSlug()))}
					label={view.label}
					spoken={
						view.match === "/inbox" && inboxStore.unread() > 0
							? `Inbox, ${inboxStore.unread()} unread`
							: undefined
					}
					icon={view.icon()}
					shortcut={view.shortcut}
					current={at(view.match)}
					dot={view.match === "/inbox" && inboxStore.unread() > 0}
				/>
			)}
		</For>
	);
}

/**
 * The floating sidebar: the views row, then the screen's own panel (settings' pages, a list of
 * notes) or the workspace's projects with their threads.
 */
export function FloatingSidebar(props: {
	/** In place of the screen's panel: settings' pages. */
	body?: () => JSX.Element;
}): JSX.Element {
	const shell = useShell();
	const location = useLocation();

	return (
		<FloatingPanel label="Workspace" views={<ViewsRow />}>
			<Show
				when={props.body}
				fallback={
					<Show
						when={shell.panel()}
						fallback={
							<Loading
								fallback={
									<Stack gap={1}>
										<Skeleton class="h-8" />
										<Skeleton class="h-8" />
									</Stack>
								}
							>
								<div class="pt-1">
									<ProjectTree />
								</div>
							</Loading>
						}
					>
						{(panel) => (
							<>
								{/* A screen's own actions (a new note) over its panel, named by the section. */}
								<Show when={shell.panelActions()}>
									{(actions) => (
										<Row justify="between" class="h-8 shrink-0 pl-2">
											<Text size="caption" tone="subtle" weight="medium" truncate>
												{sectionTitle(location.pathname)}
											</Text>
											<Row gap={0.5}>{actions()()}</Row>
										</Row>
									)}
								</Show>
								<div class="pt-1">{panel()()}</div>
							</>
						)}
					</Show>
				}
			>
				{(body) => <>{body()()}</>}
			</Show>
		</FloatingPanel>
	);
}

/** Settings, from the canvas's lower left corner. */
export function SettingsCorner(): JSX.Element {
	const location = useLocation();
	return (
		<RailLink
			href={workspaceHref("/settings")}
			label="Settings"
			shortcut="Mod ,"
			icon={<SettingsIcon />}
			current={location.pathname.startsWith("/settings")}
			size="bar"
		/>
	);
}
