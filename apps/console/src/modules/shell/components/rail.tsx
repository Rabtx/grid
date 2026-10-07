import { useLocation } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";

import {
	AsteriskIcon,
	AlertIcon,
	BoardIcon,
	BoltIcon,
	BrandTile,
	ChatIcon,
	CloudIcon,
	FileIcon,
	HomeIcon,
	InboxIcon,
	LaptopIcon,
	NoteIcon,
	PullRequestIcon,
	RailButton,
	RailLink,
	SettingsIcon,
	TerminalIcon,
} from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";
import { inboxStore } from "@/modules/inbox";
import { useWorkspace } from "@/modules/projects";
import { useTerminalAccess } from "@/modules/workspaces";

import { useShell } from "../context/shell-context";

import { AccountMenu } from "./account-menu";

type Destination = {
	label: string;
	icon: () => JSX.Element;
	/** Where it opens, from the project you are in. */
	href: (slug: string | null) => string;
	/** The path prefix that marks it current. */
	match: string;
	shortcut?: string;
};

// The Figma rail, in its order. Browser joins it once its screen ships; a rail
// item that leads nowhere is not drawn.
export const VIEWS: readonly Destination[] = [
	{ label: "Home", icon: () => <HomeIcon />, href: () => "/home", match: "/home" },
	{ label: "Inbox", icon: () => <InboxIcon />, href: () => "/inbox", match: "/inbox" },
	{
		label: "Threads",
		icon: () => <ChatIcon />,
		href: (slug) => (slug ? `/chat/${slug}` : "/chat"),
		match: "/chat",
	},
	{
		label: "Board",
		icon: () => <BoardIcon />,
		href: (slug) => (slug ? `/board/${slug}` : "/board"),
		match: "/board",
	},
	{
		label: "Files",
		icon: () => <FileIcon />,
		href: (slug) => (slug ? `/files/${slug}` : "/board"),
		match: "/files",
	},
	{
		label: "Notes",
		icon: () => <NoteIcon />,
		href: (slug) => (slug ? `/notes/${slug}` : "/board"),
		match: "/notes",
	},
	{
		label: "Terminal",
		icon: () => <TerminalIcon />,
		href: () => "/terminal",
		match: "/terminal",
		shortcut: "g t",
	},
	{
		label: "Pull requests",
		icon: () => <PullRequestIcon />,
		href: (slug) => (slug ? `/pulls/${slug}` : "/board"),
		match: "/pulls",
	},
	{
		label: "Ship",
		icon: () => <CloudIcon />,
		href: (slug) => (slug ? `/ship/${slug}` : "/board"),
		match: "/ship",
	},
	{
		label: "Operate",
		icon: () => <AlertIcon />,
		href: (slug) => (slug ? `/operate/${slug}` : "/board"),
		match: "/operate",
	},
	{
		label: "Automations",
		icon: () => <BoltIcon />,
		href: () => "/automations",
		match: "/automations",
	},
];

const FOOT: readonly Destination[] = [
	{
		label: "Machines",
		icon: () => <LaptopIcon />,
		href: () => "/machines",
		match: "/machines",
	},
	{
		label: "Agents",
		icon: () => <AsteriskIcon />,
		href: () => "/agents",
		match: "/agents",
	},
];

const SETTINGS_PAGES = /^\/settings(?!\/(machines|agents)(\/|$))(\/|$)/;

/**
 * The icon rail (the Figma Grid/Sidebar/Rail): the mark, which folds the panel away on desktop,
 * then every destination as a 32px tile with its name as a tooltip, and at the foot the machines,
 * agents, settings and who is signed in.
 */
export function Rail(): JSX.Element {
	const shell = useShell();
	const workspace = useWorkspace();
	const terminals = useTerminalAccess();
	// Terminals only for roles that may open one.
	const views = () => VIEWS.filter((view) => view.match !== "/terminal" || terminals());
	const location = useLocation();
	const at = (prefix: string) =>
		location.pathname === prefix || location.pathname.startsWith(`${prefix}/`);

	return (
		<nav aria-label="Destinations" class="flex h-full min-h-0 flex-col items-center">
			<div class="flex h-13 w-full shrink-0 items-center justify-center border-line border-b pointer-coarse:h-14">
				<Show when={shell.desktop()} fallback={<BrandTile />}>
					<RailButton
						label={shell.collapsed() ? "Show panel" : "Hide panel"}
						icon={<BrandTile />}
						aria-expanded={shell.collapsed() ? "false" : "true"}
						onClick={() => shell.toggleCollapsed()}
					/>
				</Show>
			</div>
			<div class="flex min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-y-auto pt-2 [scrollbar-width:none]">
				<For each={views()}>
					{(view) => (
						<RailLink
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
			</div>
			<div class="flex shrink-0 flex-col items-center gap-1 pt-2 pb-2">
				<For each={FOOT}>
					{(item) => (
						<RailLink
							href={workspaceHref(item.href(null))}
							label={item.label}
							icon={item.icon()}
							current={at(item.match)}
						/>
					)}
				</For>
				<RailLink
					href={workspaceHref("/settings")}
					label="Settings"
					shortcut="Mod ,"
					icon={<SettingsIcon />}
					current={SETTINGS_PAGES.test(location.pathname)}
				/>
				<AccountMenu compact />
			</div>
		</nav>
	);
}
