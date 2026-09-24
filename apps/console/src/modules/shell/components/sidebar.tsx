import { useLocation } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { Loading, Show } from "solid-js";

import { useWorkspace } from "@/modules/projects";
import {
	BackIcon,
	BoardIcon,
	BrandMark,
	ChatIcon,
	CloseIcon,
	ForwardIcon,
	PlusIcon,
	SearchIcon,
	SettingsIcon,
	SidebarIcon,
	Skeleton,
	TerminalIcon,
} from "@/ui";

import { useShell } from "../context/shell-context";

import { ProjectTree } from "./project-tree";

// One row recipe for every destination: quiet ink at rest, full ink and a fill when current.
export const NAV_ROW =
	"focus-ring flex h-8 w-full items-center gap-2 rounded-md px-2 text-left font-medium text-ink/50 text-ui transition-colors duration-fast ease-out-grid hover:bg-ink/10 hover:text-ink aria-[current=page]:bg-selection-strong aria-[current=page]:text-ink pointer-coarse:h-11";

// Small square buttons in the sidebar's top row.
const TOP_BUTTON =
	"focus-ring grid size-6.5 place-items-center rounded-md text-ink/50 hover:bg-ink/10 hover:text-ink disabled:text-ink/25 disabled:hover:bg-transparent pointer-coarse:size-10";

/** Keyboard hint beside a row; hidden on touch screens, which have no keyboard to hint at. */
function Hint(props: { children: string }): JSX.Element {
	return (
		<span class="shrink-0 font-normal text-ink/40 text-ui-caption pointer-coarse:hidden">
			{props.children}
		</span>
	);
}

/**
 * The primary sidebar: history and folding, search, destinations, projects with their threads,
 * and settings. The same component is the desktop column and the phone drawer.
 */
export function Sidebar(props: { onClose?: () => void }): JSX.Element {
	const shell = useShell();
	const workspace = useWorkspace();
	const location = useLocation();
	const current = (prefix: string) => (location.pathname.startsWith(prefix) ? "page" : undefined);

	return (
		<nav aria-label="Navigation" class="flex h-full min-h-0 flex-col">
			<div class="flex h-10 shrink-0 select-none items-center gap-0.5 pr-1.5 pl-3 pointer-coarse:h-12">
				<a href="/" class="focus-ring mr-auto rounded-sm" aria-label="Grid home">
					<BrandMark class="size-5" />
				</a>
				<button type="button" class={TOP_BUTTON} title="Back" onClick={() => history.back()}>
					<BackIcon class="size-3.5" />
				</button>
				<button type="button" class={TOP_BUTTON} title="Forward" onClick={() => history.forward()}>
					<ForwardIcon class="size-3.5" />
				</button>
				<Show
					when={props.onClose}
					fallback={
						<button
							type="button"
							class={`${TOP_BUTTON} text-ink`}
							title="Hide sidebar"
							onClick={() => shell.toggleCollapsed()}
						>
							<SidebarIcon class="size-3.5" />
						</button>
					}
				>
					{(close) => (
						<button type="button" class={TOP_BUTTON} title="Close" onClick={() => close()()}>
							<CloseIcon class="size-4" />
						</button>
					)}
				</Show>
			</div>

			<div class="flex shrink-0 flex-col gap-px px-2 pt-0.5 pb-2">
				<button
					type="button"
					class={`${NAV_ROW} mb-1 border border-ink/8 px-1.5 shadow-sm`}
					onClick={() => shell.setPaletteOpen(true)}
				>
					<SearchIcon class="size-4 shrink-0" />
					<span class="min-w-0 flex-1 truncate">Search</span>
					<Hint>Ctrl+K</Hint>
				</button>
				{/* `/board` and `/chat` open the current project, so these links never wait on data. */}
				<a href="/board" aria-current={current("/board")} class={NAV_ROW}>
					<BoardIcon class="size-4 shrink-0" />
					Board
				</a>
				<a href="/chat" aria-current={current("/chat")} class={NAV_ROW}>
					<ChatIcon class="size-4 shrink-0" />
					Chat
				</a>
				<a href="/terminal" aria-current={current("/terminal")} class={NAV_ROW}>
					<TerminalIcon class="size-4 shrink-0" />
					Terminal
				</a>
			</div>

			<div class="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain pb-2">
				<div class="flex items-center gap-1 px-3 pt-1 pb-1.5">
					<h2 class="min-w-0 flex-1 truncate px-1 text-ink/50 text-ui-xs">Projects</h2>
					<button
						type="button"
						title="Open a folder as a project"
						aria-label="Add project"
						class="focus-ring grid size-5 shrink-0 place-items-center rounded-md text-ink/50 hover:bg-ink/8 hover:text-ink pointer-coarse:size-9"
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

			<div class="flex shrink-0 flex-col gap-px p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
				<a href="/settings/appearance" aria-current={current("/settings")} class={NAV_ROW}>
					<SettingsIcon class="size-4 shrink-0" />
					<span class="min-w-0 flex-1 truncate">Settings</span>
					<Hint>Ctrl+,</Hint>
				</a>
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
