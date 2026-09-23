import type { JSX } from "@solidjs/web";
import { For, Loading, Show } from "solid-js";

import { useAuth } from "@/modules/auth";
import { useWorkspace } from "@/modules/projects";
import { BoardIcon, Caption, SignOutIcon, Skeleton } from "@/ui";

// One nav row recipe for every destination: secondary ink at rest, selection fill when current.
const NAV_ROW =
	"focus-ring flex h-row items-center gap-2 rounded-md px-2 text-ink/70 text-ui transition-colors duration-fast ease-out-grid hover:bg-ink/8 hover:text-ink aria-[current=page]:bg-selection aria-[current=page]:font-medium aria-[current=page]:text-ink";

/**
 * Brand, destinations, projects and account — the navigation shared by the phone drawer and
 * the desktop sidebar, so both always show the same thing.
 */
export function ProjectNav(): JSX.Element {
	const auth = useAuth();
	const workspace = useWorkspace();

	return (
		<div class="flex h-full min-h-0 flex-col gap-3 p-2">
			<div class="flex h-10 items-center px-2">
				<span class="font-semibold text-ui">Grid</span>
			</div>

			<nav aria-label="Workspace" class="flex flex-col gap-0.5">
				<a
					href={workspace.activeSlug() ? `/board/${workspace.activeSlug()}` : "/board"}
					aria-current={workspace.activeSlug() ? "page" : undefined}
					class={NAV_ROW}
				>
					<BoardIcon class="size-4 shrink-0" />
					Board
				</a>
			</nav>

			<nav aria-label="Projects" class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
				<Caption class="px-2 pt-2 pb-1">Projects</Caption>
				<Loading fallback={<ProjectListSkeleton />}>
					<ProjectList />
				</Loading>
			</nav>

			<div class="flex flex-col gap-0.5 border-stroke border-t pt-2">
				<Show when={auth.user()}>
					{(user) => (
						<p class="truncate px-2 py-1 text-ink/45 text-ui-xs" title={user().email}>
							{user().email}
						</p>
					)}
				</Show>
				<button type="button" onClick={() => void auth.logout()} class={NAV_ROW}>
					<SignOutIcon class="size-4 shrink-0" />
					Sign out
				</button>
			</div>
		</div>
	);
}

function ProjectList(): JSX.Element {
	const workspace = useWorkspace();

	return (
		<Show
			when={workspace.projects().length > 0}
			fallback={<p class="px-2 text-ink/45 text-ui-sm">No projects yet.</p>}
		>
			<ul class="flex flex-col gap-0.5">
				<For each={workspace.projects()}>
					{(project) => (
						<li>
							<a
								href={`/board/${project.slug}`}
								aria-current={project.slug === workspace.activeSlug() ? "page" : undefined}
								class={NAV_ROW}
							>
								<span
									class="grid size-4 shrink-0 place-items-center rounded-sm bg-ink/10 font-semibold text-ink/70 text-ui-caption uppercase"
									aria-hidden="true"
								>
									{project.name.slice(0, 1)}
								</span>
								<span class="truncate">{project.name}</span>
							</a>
						</li>
					)}
				</For>
			</ul>
		</Show>
	);
}

function ProjectListSkeleton(): JSX.Element {
	return (
		<div class="flex flex-col gap-1 px-2" aria-hidden="true">
			<Skeleton class="h-row" />
			<Skeleton class="h-row" />
		</div>
	);
}
