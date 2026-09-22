import type { JSX } from "@solidjs/web";
import { Loading, Show } from "solid-js";

import { useWorkspace } from "@/modules/projects";

import { PlusIcon } from "./icons";

/** Desktop page header: the project's name and size, and the labelled primary action. */
export function WorkspaceHeader(): JSX.Element {
	const workspace = useWorkspace();

	return (
		<header class="hidden items-center justify-between gap-4 border-border border-b px-8 py-4 lg:flex">
			<Loading fallback={<div class="h-8 w-48 animate-pulse rounded-md bg-accent" />}>
				<Show when={workspace.activeProject()} fallback={<span />}>
					{(project) => (
						<div class="min-w-0">
							<h1 class="truncate font-semibold text-title">{project().name}</h1>
							<p class="text-muted-foreground text-ui-sm">
								{workspace.tasks().length} task{workspace.tasks().length === 1 ? "" : "s"}
							</p>
						</div>
					)}
				</Show>
			</Loading>
			<button
				type="button"
				aria-haspopup="dialog"
				disabled={!workspace.activeSlug()}
				onClick={() => workspace.setNewTaskOpen(true)}
				class="flex h-control shrink-0 items-center gap-2 rounded-md bg-primary px-3 font-medium text-primary-foreground text-ui transition-opacity duration-fast ease-out-grid hover:opacity-90 disabled:opacity-40"
			>
				<PlusIcon class="size-4" />
				New task
			</button>
		</header>
	);
}
