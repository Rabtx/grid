import { useLocation } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { Loading, Show } from "solid-js";

import { workspaceHref } from "@/lib/active-workspace";
import { useWorkspace } from "@/modules/projects";
import { WorkspaceSwitcher } from "@/modules/workspaces";
import {
	CloseIcon,
	EditIcon,
	PlusIcon,
	SearchIcon,
	SidebarIcon,
	Skeleton,
	TerminalIcon,
} from "@/ui";

import { useShell } from "../context/shell-context";

import { AccountMenu } from "./account-menu";
import { ProjectTree } from "./project-tree";

// One row recipe for every destination: quiet ink at rest, full ink and a fill when current.
export const NAV_ROW =
	"focus-ring flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-ink/70 text-ui transition-colors duration-fast ease-out-grid hover:bg-ink/6 hover:text-ink aria-[current=page]:bg-selection-strong aria-[current=page]:font-medium aria-[current=page]:text-ink pointer-coarse:h-11";

// Small square buttons beside the workspace name.
const TOP_BUTTON =
	"focus-ring grid size-7 shrink-0 place-items-center rounded-md text-ink/50 transition-colors duration-fast ease-out-grid hover:bg-ink/6 hover:text-ink pointer-coarse:size-11";

/** Keyboard hint beside a row; hidden on touch screens, which have no keyboard to hint at. */
function Hint(props: { children: string }): JSX.Element {
	return (
		<span class="shrink-0 rounded-sm border border-ink/10 px-1 font-normal text-ink/40 text-ui-caption leading-4 pointer-coarse:hidden">
			{props.children}
		</span>
	);
}

/**
 * The primary navigation: the workspace and its switcher, the everyday destinations, the
 * workspace's projects with their threads, and who is signed in. The same component is the
 * desktop column and the phone drawer.
 */
export function Sidebar(props: { onClose?: () => void }): JSX.Element {
	const shell = useShell();
	const workspace = useWorkspace();
	const location = useLocation();
	const current = (prefix: string) => (location.pathname.startsWith(prefix) ? "page" : undefined);
	const newChat = () => {
		const slug = workspace.currentSlug();
		return slug ? `/chat/${slug}` : "/chat";
	};

	return (
		<nav aria-label="Navigation" class="flex h-full min-h-0 flex-col">
			<div class="flex h-12 shrink-0 select-none items-center gap-1 px-2 pointer-coarse:h-14">
				<div class="min-w-0 flex-1">
					<WorkspaceSwitcher />
				</div>
				<Show
					when={props.onClose}
					fallback={
						<button
							type="button"
							class={TOP_BUTTON}
							title="Hide sidebar"
							aria-label="Hide sidebar"
							onClick={() => shell.toggleCollapsed()}
						>
							<SidebarIcon class="size-4" />
						</button>
					}
				>
					{(close) => (
						<button type="button" class={TOP_BUTTON} aria-label="Close" onClick={() => close()()}>
							<CloseIcon class="size-4.5" />
						</button>
					)}
				</Show>
			</div>

			<div class="flex shrink-0 flex-col gap-px px-2 pb-3">
				<Loading fallback={<Skeleton class="h-8" />}>
					<a href={workspaceHref(newChat())} class={NAV_ROW}>
						<EditIcon class="size-4 shrink-0 text-ink/55" />
						<span class="min-w-0 flex-1 truncate">New chat</span>
					</a>
				</Loading>
				<button type="button" class={NAV_ROW} onClick={() => shell.setPaletteOpen(true)}>
					<SearchIcon class="size-4 shrink-0 text-ink/55" />
					<span class="min-w-0 flex-1 truncate">Search</span>
					<Hint>Ctrl K</Hint>
				</button>
				<a href={workspaceHref("/terminal")} aria-current={current("/terminal")} class={NAV_ROW}>
					<TerminalIcon class="size-4 shrink-0 text-ink/55" />
					Terminal
				</a>
			</div>

			<div class="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain pb-2">
				<div class="group/projects flex items-center gap-1 px-2 pb-1">
					<h2 class="min-w-0 flex-1 truncate px-2 text-ink/45 text-ui-xs">Projects</h2>
					<button
						type="button"
						title="Open a folder as a project"
						aria-label="Add project"
						class="focus-ring grid size-6 shrink-0 place-items-center rounded-md text-ink/45 hover:bg-ink/6 hover:text-ink pointer-coarse:size-10"
						onClick={() => workspace.setAddProjectOpen(true)}
					>
						<PlusIcon class="size-3.5" />
					</button>
				</div>
				<Loading
					fallback={
						<div class="flex flex-col gap-1 px-2" aria-hidden="true">
							<Skeleton class="h-8" />
							<Skeleton class="h-8" />
						</div>
					}
				>
					<ProjectTree />
				</Loading>
			</div>

			<div class="shrink-0 px-2 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
				<AccountMenu />
			</div>
		</nav>
	);
}

/** A project's initial in a small tile: enough to tell projects apart at a glance. */
export function ProjectMark(props: { name: string }): JSX.Element {
	return (
		<span
			class="grid size-4 shrink-0 place-items-center rounded-sm bg-ink/12 font-semibold text-ink/75 text-ui-caption uppercase"
			aria-hidden="true"
		>
			{props.name.slice(0, 1)}
		</span>
	);
}
