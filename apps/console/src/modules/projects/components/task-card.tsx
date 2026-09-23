import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import { useWorkspace } from "../context/workspace-context";
import type { Task } from "../types/project.types";

/**
 * A task on the board: key, title, then who owns it and where the work lives.
 *
 * The whole card is a link to the task's own URL, so the panel opens over the board, the URL
 * can be shared, and a reload lands on the same task.
 */
export function TaskCard(props: { task: Task }): JSX.Element {
	const workspace = useWorkspace();

	return (
		// The link wraps a whole card, so it is named explicitly: the label repeats what is visible.
		<a
			href={`/board/${workspace.activeSlug()}/tasks/${props.task.number}`}
			aria-label={`${props.task.key} ${props.task.title}`}
			class="focus-ring block rounded-lg border border-ink/10 bg-ink/5 transition-[background-color,transform] duration-fast ease-out-grid hover:bg-ink/8 active:scale-[0.98]"
		>
			<article class="flex flex-col gap-1.5 p-2.5">
				<span class="font-mono text-ink/40 text-ui-caption">{props.task.key}</span>
				<p class="line-clamp-3 break-words font-medium text-ink/90 text-ui leading-snug">
					{props.task.title}
				</p>
				<div class="flex min-w-0 items-center gap-2 pt-0.5 text-ink/45 text-ui-xs">
					<Show
						when={props.task.owner}
						fallback={
							<>
								<span
									class="size-3.5 shrink-0 rounded-full border border-ink/30 border-dashed"
									aria-hidden="true"
								/>
								<span>Unassigned</span>
							</>
						}
					>
						{(owner) => (
							<>
								<span class="size-3.5 shrink-0 rounded-full bg-ink/20" aria-hidden="true" />
								<span class="max-w-[60%] shrink-0 truncate">{owner().name ?? owner().kind}</span>
							</>
						)}
					</Show>
					<Show when={props.task.branch}>
						{(branch) => (
							<span class="ml-auto min-w-0 truncate font-mono" title={branch()}>
								{branch()}
							</span>
						)}
					</Show>
				</div>
			</article>
		</a>
	);
}
