import CheckmarkCircle02Icon from "@hugeicons/core-free-icons/CheckmarkCircle02Icon";
import CircleDashedIcon from "@hugeicons/core-free-icons/CircleDashedIcon";
import CircleDotIcon from "@hugeicons/core-free-icons/CircleDotIcon";
import type { JSX } from "@solidjs/web";
import { Match, Switch } from "solid-js";

import { Icon } from "@/kit";

import { lookOf, STATUS_TEXT_CLASS } from "../lib/stage-style";
import type { TaskStatus, WorkflowCategory } from "../types/project.types";

/**
 * A stage drawn as a shape as well as a colour, so it reads without colour vision: waiting
 * stages are outlines, work in flight fills in, finished carries a check. Backlog, review and
 * done are Hugeicons glyphs; the icon set has no half- or three-quarter-filled circle, so the
 * in-flight stages are drawn on the same 24px grid and stroke.
 */
export function StatusIcon(props: {
	status: TaskStatus;
	/** A status of the project's own is drawn as the built-in of its kind. */
	category?: WorkflowCategory;
	class?: string;
}): JSX.Element {
	const look = () => lookOf(props.status, props.category);
	const cls = () => `${props.class ?? "size-3.5"} shrink-0 ${STATUS_TEXT_CLASS[look()]}`;

	return (
		<Switch fallback={<Drawn class={cls()} />}>
			<Match when={look() === "backlog"}>
				<Icon icon={CircleDashedIcon} class={cls()} />
			</Match>
			<Match when={look() === "review"}>
				<Icon icon={CircleDotIcon} class={cls()} />
			</Match>
			<Match when={look() === "done"}>
				<Icon icon={CheckmarkCircle02Icon} class={cls()} />
			</Match>
			<Match when={look() === "in_progress"}>
				<Drawn class={cls()}>
					<path d="M12 6.5a5.5 5.5 0 0 1 0 11z" fill="currentColor" stroke="none" />
				</Drawn>
			</Match>
			<Match when={look() === "qa"}>
				<Drawn class={cls()}>
					<path d="M12 6.5A5.5 5.5 0 1 1 6.5 12H12z" fill="currentColor" stroke="none" />
				</Drawn>
			</Match>
			<Match when={look() === "blocked"}>
				<Drawn class={cls()}>
					<path d="M8.5 12h7" stroke-linecap="round" vector-effect="non-scaling-stroke" />
				</Drawn>
			</Match>
		</Switch>
	);
}

/**
 * A ring on the icon set's grid and stroke weight (1.8px on screen at any size, as the icons draw
 * theirs), with an optional mark inside.
 */
function Drawn(props: { class: string; children?: JSX.Element }): JSX.Element {
	return (
		<svg
			viewBox="0 0 24 24"
			class={props.class}
			fill="none"
			stroke="currentColor"
			stroke-width="1.8"
			aria-hidden="true"
		>
			<circle cx="12" cy="12" r="10" vector-effect="non-scaling-stroke" />
			{props.children}
		</svg>
	);
}
