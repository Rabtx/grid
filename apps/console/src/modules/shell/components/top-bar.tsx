import type { JSX } from "@solidjs/web";
import { Loading } from "solid-js";

import { useWorkspace } from "@/modules/projects";
import { IconButton, MenuIcon, PlusIcon } from "@/ui";

/** Phone chrome: menu, current project, and the primary action within thumb reach. */
export function TopBar(props: { onOpenMenu: () => void }): JSX.Element {
	const workspace = useWorkspace();

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
					<Loading fallback="Grid">{workspace.activeProject()?.name ?? "Grid"}</Loading>
				</p>
				<IconButton
					label="New task"
					aria-haspopup="dialog"
					disabled={!workspace.activeSlug()}
					onClick={() => workspace.setNewTaskOpen(true)}
				>
					<PlusIcon class="size-5" />
				</IconButton>
			</div>
		</header>
	);
}
