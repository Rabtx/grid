import { useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, Loading, Show } from "solid-js";

import { useWorkspace } from "../context/workspace-context";

/** `/` and `/board` have no project of their own: send the visitor to the first one. */
export function ProjectRedirect(): JSX.Element {
	const workspace = useWorkspace();
	const navigate = useNavigate();

	createEffect(
		() => workspace.projects()[0]?.slug,
		(slug) => {
			if (slug) navigate(`/board/${slug}`, { replace: true });
		},
	);

	return (
		<Loading fallback={<p class="text-muted-foreground text-ui-sm">Loading projects…</p>}>
			<Show when={workspace.projects().length === 0}>
				<div class="space-y-1 py-8">
					<h1 class="font-semibold text-title">No projects yet</h1>
					<p class="text-muted-foreground text-ui">
						Projects hold the board and the agent runs that work on it.
					</p>
				</div>
			</Show>
		</Loading>
	);
}
