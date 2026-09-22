import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import type { Task } from "../types/project.types";

interface TaskCardProps {
	task: Task;
}

export function TaskCard(props: TaskCardProps): JSX.Element {
	return (
		<article class="rounded-md border border-border bg-card p-3 space-y-1.5">
			<div class="flex items-baseline justify-between gap-2">
				<span class="font-mono text-ui-xs text-text-subtle">{props.task.key}</span>
				<Show when={props.task.owner}>
					{(owner) => (
						<span class="rounded border border-border px-1.5 text-ui-xs">
							{owner().name ?? owner().kind}
						</span>
					)}
				</Show>
			</div>
			<span class="block text-ui break-words">{props.task.title}</span>
			<Show when={props.task.branch}>
				{(branch) => (
					<span class="block truncate font-mono text-ui-xs text-muted-foreground">{branch()}</span>
				)}
			</Show>
		</article>
	);
}
