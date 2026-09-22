import type { JSX } from "@solidjs/web";
import { For, Loading, Show } from "solid-js";

import { useAuth } from "@/modules/auth";
import { useWorkspace } from "@/modules/projects";

/**
 * Brand, project list and account controls — the navigation shared by the phone drawer and
 * the desktop sidebar, so both always show the same thing.
 */
export function ProjectNav(): JSX.Element {
	const auth = useAuth();

	return (
		<div class="flex h-full min-h-0 flex-col gap-4 p-3">
			<span class="px-3 pt-2 font-semibold text-ui-lg">Grid</span>

			<nav aria-label="Projects" class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
				<h2 class="px-3 pb-1 font-medium text-muted-foreground text-ui-xs uppercase">Projects</h2>
				<Loading fallback={<ProjectListSkeleton />}>
					<ProjectList />
				</Loading>
			</nav>

			<div class="flex flex-col gap-1 border-border border-t pt-3">
				<Show when={auth.user()}>
					{(user) => (
						<p class="truncate px-3 text-muted-foreground text-ui-sm" title={user().email}>
							{user().email}
						</p>
					)}
				</Show>
				<button
					type="button"
					onClick={() => void auth.logout()}
					class="flex min-h-row w-full items-center rounded-md px-3 text-left text-ui transition-colors duration-fast ease-out-grid hover:bg-accent focus-visible:bg-accent"
				>
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
			fallback={<p class="px-3 text-muted-foreground text-ui-sm">No projects yet.</p>}
		>
			<ul class="flex flex-col gap-0.5">
				<For each={workspace.projects()}>
					{(project) => (
						<li>
							<a
								href={`/board/${project.slug}`}
								aria-current={project.slug === workspace.activeSlug() ? "page" : undefined}
								class="flex min-h-row items-center rounded-md px-3 text-ui transition-colors duration-fast ease-out-grid hover:bg-accent focus-visible:bg-accent aria-[current=page]:bg-accent aria-[current=page]:font-medium"
							>
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
		<div class="flex flex-col gap-1 px-3" aria-hidden="true">
			<div class="h-row animate-pulse rounded-md bg-accent motion-reduce:animate-none" />
			<div class="h-row animate-pulse rounded-md bg-accent motion-reduce:animate-none" />
		</div>
	);
}
