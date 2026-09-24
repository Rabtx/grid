import { useLocation } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { Loading, Show } from "solid-js";

import { useWorkspace } from "@/modules/projects";
import { IconButton, MenuIcon, PlusIcon } from "@/ui";

// Screens outside the board name themselves; the board is named after its project.
const SECTION_TITLES: [prefix: string, title: string][] = [
	["/terminal", "Terminal"],
	["/settings", "Settings"],
];

/** Phone chrome: menu, where you are, and the screen's primary action within thumb reach. */
export function TopBar(props: { onOpenMenu: () => void }): JSX.Element {
	const workspace = useWorkspace();
	const location = useLocation();
	const section = () =>
		SECTION_TITLES.find(([prefix]) => location.pathname.startsWith(prefix))?.[1] ?? null;

	return (
		<header class="glass sticky top-0 z-30 border-stroke border-b pt-[env(safe-area-inset-top)] lg:hidden">
			<div class="flex h-12 items-center gap-1 px-1.5">
				<IconButton
					label="Open navigation"
					aria-haspopup="dialog"
					onClick={() => props.onOpenMenu()}
				>
					<MenuIcon class="size-5" />
				</IconButton>
				<p class="min-w-0 flex-1 truncate text-center font-medium text-ui">
					<Show
						when={section()}
						fallback={
							<Loading fallback="Grid">{workspace.activeProject()?.name ?? "Grid"}</Loading>
						}
					>
						{section()}
					</Show>
				</p>
				{/* Balance the menu button so the title stays centred when there is no action. */}
				<Show when={workspace.activeSlug()} fallback={<span class="size-control" />}>
					<IconButton
						label="New task"
						aria-haspopup="dialog"
						onClick={() => workspace.setNewTaskOpen(true)}
					>
						<PlusIcon class="size-5" />
					</IconButton>
				</Show>
			</div>
		</header>
	);
}
