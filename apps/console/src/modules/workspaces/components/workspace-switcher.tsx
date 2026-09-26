import type { JSX } from "@solidjs/web";
import { For, Loading, Show } from "solid-js";

import { CheckIcon, PlusIcon, Popover, SettingsIcon, UnfoldIcon } from "@/ui";

import { useWorkspaces } from "../context/workspaces-context";

import { WorkspaceMark } from "./workspace-mark";

const ROW =
	"focus-ring flex h-row w-full items-center gap-2.5 rounded-md px-2 text-left text-ink/80 text-ui transition-colors duration-fast ease-out-grid hover:bg-ink/6 hover:text-ink pointer-coarse:min-h-12";

/**
 * The workspace you are in, at the top of the navigation, and the list to move between them:
 * a menu under the name on desktop, a bottom sheet on phones.
 */
export function WorkspaceSwitcher(): JSX.Element {
	const workspaces = useWorkspaces();

	return (
		<Loading fallback={<div class="h-control" />}>
			<Popover
				label="Switch workspace"
				side="below"
				panelClass="md:w-64"
				triggerClass="focus-ring flex h-control min-w-0 max-w-full items-center gap-2 rounded-md px-1.5 text-left transition-colors duration-fast ease-out-grid hover:bg-ink/6 pointer-coarse:h-11"
				trigger={
					<>
						<WorkspaceMark
							name={workspaces.current()?.name ?? "Grid"}
							color={workspaces.current()?.color}
						/>
						<span class="min-w-0 truncate font-medium text-ink text-ui">
							{workspaces.current()?.name ?? "Grid"}
						</span>
						<UnfoldIcon class="size-3.5 shrink-0 text-ink/40" />
					</>
				}
			>
				{(close) => (
					<div class="flex flex-col p-1.5 md:p-1">
						<p class="px-2 pt-1 pb-1.5 text-ink/45 text-ui-xs">Workspaces</p>
						<For each={workspaces.list()}>
							{(workspace) => (
								<button
									type="button"
									class={ROW}
									aria-current={workspace.slug === workspaces.current()?.slug ? "true" : undefined}
									onClick={() => {
										close();
										workspaces.switchTo(workspace);
									}}
								>
									<WorkspaceMark name={workspace.name} color={workspace.color} />
									<span class="min-w-0 flex-1 truncate">{workspace.name}</span>
									<Show when={workspace.slug === workspaces.current()?.slug}>
										<CheckIcon class="size-4 shrink-0 text-ink" />
									</Show>
								</button>
							)}
						</For>
						<div class="my-1 h-px bg-stroke" />
						<button
							type="button"
							class={ROW}
							onClick={() => {
								close();
								workspaces.setCreateOpen(true);
							}}
						>
							<span class="grid size-5 shrink-0 place-items-center">
								<PlusIcon class="size-4" />
							</span>
							Create workspace
						</button>
						<a href="/settings/appearance" class={ROW} onClick={() => close()}>
							<span class="grid size-5 shrink-0 place-items-center">
								<SettingsIcon class="size-4" />
							</span>
							Settings
						</a>
					</div>
				)}
			</Popover>
		</Loading>
	);
}
