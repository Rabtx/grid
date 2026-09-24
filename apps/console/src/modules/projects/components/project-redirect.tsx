import { useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, Loading, Show } from "solid-js";

import { EmptyState } from "@/ui";

import { useWorkspace } from "../context/workspace-context";

/** `/` and `/board` have no project of their own: open the current one (last used, else first). */
export function ProjectRedirect(): JSX.Element {
	const workspace = useWorkspace();
	const navigate = useNavigate();

	createEffect(
		() => workspace.currentSlug(),
		(slug) => {
			if (slug) navigate(`/board/${slug}`, { replace: true });
		},
	);

	return (
		<Loading fallback={<p class="py-12 text-center text-ink/40 text-ui-sm">Loading projects…</p>}>
			<Show when={workspace.projects().length === 0}>
				<EmptyState
					title="No projects yet"
					description="Projects hold the board and the agent runs that work on it."
				/>
			</Show>
		</Loading>
	);
}
