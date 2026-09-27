import { useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, Loading, Show } from "solid-js";

import { Button, EmptyState, PlusIcon, Text } from "@/kit";

import { useWorkspace } from "../context/workspace-context";

/**
 * `/` and `/board` have no project of their own: open the current one (last used, else first) —
 * its chats from `/`, its board from `/board`.
 */
export function ProjectRedirect(props: { to: "chat" | "board" }): JSX.Element {
	const workspace = useWorkspace();
	const navigate = useNavigate();

	createEffect(
		() => workspace.currentSlug(),
		(slug) => {
			if (!slug) return;
			navigate(props.to === "board" ? `/board/${slug}` : workspace.projectHref(slug), {
				replace: true,
			});
		},
	);

	return (
		<Loading
			fallback={
				<Text tone="faint" class="py-12 text-center">
					Loading projects…
				</Text>
			}
		>
			<Show when={workspace.projects().length === 0}>
				<EmptyState
					title="No projects yet"
					description="A project is a folder on this machine: its chats, terminals and board live in it."
					action={
						<Button
							variant="primary"
							icon={<PlusIcon size="sm" />}
							onClick={() => workspace.setAddProjectOpen(true)}
						>
							Add project
						</Button>
					}
				/>
			</Show>
		</Loading>
	);
}
