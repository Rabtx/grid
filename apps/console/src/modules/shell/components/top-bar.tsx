import type { JSX } from "@solidjs/web";
import { Loading } from "solid-js";

import { useWorkspace } from "@/modules/projects";

import { MenuIcon, PlusIcon } from "./icons";

/** Phone chrome: menu, current project, and the primary action within thumb reach. */
export function TopBar(props: { onOpenMenu: () => void }): JSX.Element {
	const workspace = useWorkspace();

	return (
		<header class="sticky top-0 z-30 border-border border-b bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden">
			<div class="flex h-14 items-center gap-1 px-1.5">
				<button
					type="button"
					aria-label="Open navigation"
					aria-haspopup="dialog"
					onClick={() => props.onOpenMenu()}
					class="flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-accent focus-visible:bg-accent"
				>
					<MenuIcon />
				</button>
				<p class="min-w-0 flex-1 truncate text-center font-semibold text-ui-lg">
					<Loading fallback="Grid">{workspace.activeProject()?.name ?? "Grid"}</Loading>
				</p>
				<button
					type="button"
					aria-label="New task"
					aria-haspopup="dialog"
					disabled={!workspace.activeSlug()}
					onClick={() => workspace.setNewTaskOpen(true)}
					class="flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-accent focus-visible:bg-accent disabled:opacity-40"
				>
					<PlusIcon />
				</button>
			</div>
		</header>
	);
}
