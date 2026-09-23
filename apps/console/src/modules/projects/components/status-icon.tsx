import type { JSX } from "@solidjs/web";
import { Match, Switch } from "solid-js";

import { STATUS_TEXT_CLASS } from "../lib/stage-style";
import type { TaskStatus } from "../types/project.types";

/**
 * A stage drawn as a shape as well as a colour, so it reads without colour vision: waiting
 * stages are outlines, work in flight fills in, finished is solid with a check.
 */
export function StatusIcon(props: { status: TaskStatus; class?: string }): JSX.Element {
	return (
		<svg
			viewBox="0 0 16 16"
			class={`${props.class ?? "size-3.5"} shrink-0 ${STATUS_TEXT_CLASS[props.status]}`}
			fill="none"
			stroke="currentColor"
			stroke-width="1.6"
			aria-hidden="true"
		>
			<Switch fallback={<circle cx="8" cy="8" r="6" />}>
				<Match when={props.status === "backlog"}>
					<circle cx="8" cy="8" r="6" stroke-dasharray="2.4 2.2" />
				</Match>
				<Match when={props.status === "in_progress"}>
					<circle cx="8" cy="8" r="6" />
					<path d="M8 4.5a3.5 3.5 0 0 1 0 7z" fill="currentColor" stroke="none" />
				</Match>
				<Match when={props.status === "review"}>
					<circle cx="8" cy="8" r="6" />
					<circle cx="8" cy="8" r="2.2" fill="currentColor" stroke="none" />
				</Match>
				<Match when={props.status === "qa"}>
					<circle cx="8" cy="8" r="6" />
					<path d="M8 4.5A3.5 3.5 0 1 1 4.5 8H8z" fill="currentColor" stroke="none" />
				</Match>
				<Match when={props.status === "blocked"}>
					<circle cx="8" cy="8" r="6" />
					<path d="M5.5 8h5" stroke-linecap="round" />
				</Match>
				<Match when={props.status === "done"}>
					<circle cx="8" cy="8" r="6.5" fill="currentColor" stroke="none" />
					<path
						d="m5.4 8.2 1.8 1.8 3.6-3.8"
						class="text-canvas"
						stroke="currentColor"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</Match>
			</Switch>
		</svg>
	);
}
