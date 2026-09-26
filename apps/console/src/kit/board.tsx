import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";

import { Avatar } from "./avatar";

export type TaskStatusKind = "backlog" | "todo" | "doing" | "review" | "done" | "blocked";

const STATUS: Record<TaskStatusKind, { label: string; color: string; fill: number }> = {
	backlog: { label: "Backlog", color: "var(--kit-fg-faint)", fill: 0 },
	todo: { label: "To do", color: "var(--kit-fg-subtle)", fill: 0 },
	doing: { label: "In progress", color: "var(--signal-warning)", fill: 0.5 },
	review: { label: "In review", color: "var(--signal-accent)", fill: 0.75 },
	done: { label: "Done", color: "var(--signal-success)", fill: 1 },
	blocked: { label: "Blocked", color: "var(--signal-danger)", fill: 0.25 },
};

/** A task's stage as a ring that fills as it moves along; a dashed ring while it waits in backlog. */
export function TaskStatus(props: { status: TaskStatusKind; class?: string }): JSX.Element {
	const look = () => STATUS[props.status];
	return (
		<svg viewBox="0 0 16 16" class={props.class ?? "size-4"}>
			<title>{look().label}</title>
			<circle
				cx="8"
				cy="8"
				r="6"
				fill="none"
				stroke={look().color}
				stroke-width="1.5"
				stroke-dasharray={props.status === "backlog" ? "2 2" : undefined}
			/>
			<Show when={look().fill > 0}>
				<circle
					cx="8"
					cy="8"
					r="3"
					fill="none"
					stroke={look().color}
					stroke-width="6"
					stroke-dasharray={`${look().fill * 18.85} 18.85`}
					transform="rotate(-90 8 8)"
				/>
			</Show>
		</svg>
	);
}

/** A task on the board: its status and number, title, labels, who has it. */
export function TaskCard(props: {
	id: string;
	title: string;
	status: TaskStatusKind;
	labels?: readonly string[];
	assignee?: string;
	agent?: boolean;
	onClick?: () => void;
}): JSX.Element {
	return (
		<button
			type="button"
			onClick={() => props.onClick?.()}
			class="focus-ring flex w-full flex-col gap-2 rounded-kit-lg bg-surface p-3 text-left shadow-[0_0_0_1px_var(--kit-line),0_1px_2px_rgb(0_0_0/0.03)] transition-shadow duration-fast hover:shadow-[0_0_0_1px_var(--kit-line-strong),0_2px_6px_-2px_rgb(0_0_0/0.08)]"
		>
			<div class="flex items-center gap-2 text-caption text-fg-subtle">
				<TaskStatus status={props.status} class="size-3.5" />
				<span class="font-mono">{props.id}</span>
				<span class="flex-1" />
				<Show when={props.assignee}>{(name) => <Avatar name={name()} size="xs" />}</Show>
			</div>
			<p class="text-body text-fg">{props.title}</p>
			<Show when={props.labels?.length || props.agent}>
				<div class="flex flex-wrap gap-1">
					<Show when={props.agent}>
						<span class="inline-flex h-5 items-center gap-1 rounded-kit-sm bg-accent/10 px-1.5 text-caption text-accent">
							<span class="size-1.5 animate-pulse rounded-full bg-accent" />
							Agent working
						</span>
					</Show>
					<For each={props.labels}>
						{(label) => (
							<span class="inline-flex h-5 items-center rounded-kit-sm px-1.5 text-caption text-fg-subtle shadow-[inset_0_0_0_1px_var(--kit-line-strong)]">
								{label}
							</span>
						)}
					</For>
				</div>
			</Show>
		</button>
	);
}

/** A board column: the stage, its count and an add button, then its cards. */
export function BoardColumn(props: {
	status: TaskStatusKind;
	count: number;
	action?: JSX.Element;
	children: JSX.Element;
}): JSX.Element {
	return (
		<section class="flex w-72 shrink-0 flex-col gap-2 rounded-kit-xl bg-surface-sunken p-2 md:w-68">
			<header class="flex h-8 items-center gap-2 px-1.5">
				<TaskStatus status={props.status} />
				<h3 class="text-body text-fg">{STATUS[props.status].label}</h3>
				<span class="text-caption text-fg-subtle tabular-nums">{props.count}</span>
				<span class="flex-1" />
				{props.action}
			</header>
			<div class="flex flex-col gap-2">{props.children}</div>
		</section>
	);
}
