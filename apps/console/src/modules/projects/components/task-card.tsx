import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import type { Task } from "../types/project.types";

/** A task on the board: key, title, then who owns it and where the work lives. */
export function TaskCard(props: { task: Task }): JSX.Element {
	return (
		<article class="flex flex-col gap-1.5 rounded-lg border border-ink/10 bg-ink/5 p-2.5">
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
	);
}
