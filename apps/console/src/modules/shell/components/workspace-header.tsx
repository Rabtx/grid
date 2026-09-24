import type { JSX } from "@solidjs/web";
import { Loading, Show } from "solid-js";

import { useWorkspace } from "@/modules/projects";
import { BoardIcon, Button, PlusIcon, Skeleton } from "@/ui";

/** Desktop view header, 40px: where you are and how big it is on the left, the action right. */
export function WorkspaceHeader(): JSX.Element {
	const workspace = useWorkspace();

	// The header belongs to the board; other screens (terminal, settings) bring their own.
	return (
		<Show when={workspace.activeSlug()}>
			<header class="hidden h-10 shrink-0 items-center justify-between gap-4 border-stroke border-b px-4 lg:flex">
				<Loading fallback={<Skeleton class="h-4 w-40" />}>
					<Show when={workspace.activeProject()} fallback={<span />}>
						{(project) => (
							<div class="flex min-w-0 items-center gap-2">
								<BoardIcon class="size-4 shrink-0 text-ink/45" />
								<h1 class="truncate font-medium text-ui">{project().name}</h1>
								<span class="shrink-0 text-ink/45 text-ui-xs tabular-nums">
									{workspace.tasks().length} task{workspace.tasks().length === 1 ? "" : "s"}
								</span>
							</div>
						)}
					</Show>
				</Loading>
				<Button
					variant="primary"
					aria-haspopup="dialog"
					disabled={!workspace.activeSlug()}
					onClick={() => workspace.setNewTaskOpen(true)}
				>
					<PlusIcon class="size-3.5" />
					New task
				</Button>
			</header>
		</Show>
	);
}
