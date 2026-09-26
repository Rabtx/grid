import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import { CloseIcon } from "./icons";

/** The row over a list or table: search and filters on the left, the view's actions on the right. */
export function Toolbar(props: { children: JSX.Element; actions?: JSX.Element }): JSX.Element {
	return (
		<div class="flex flex-wrap items-center gap-2">
			<div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">{props.children}</div>
			<Show when={props.actions}>
				<div class="flex shrink-0 items-center gap-2">{props.actions}</div>
			</Show>
		</div>
	);
}

/** A quiet toolbar button: Filter, Sort, Columns. */
export function ToolbarButton(props: {
	icon: JSX.Element;
	children: JSX.Element;
	active?: boolean;
	onClick?: () => void;
}): JSX.Element {
	return (
		<button
			type="button"
			aria-pressed={props.active ? "true" : undefined}
			onClick={() => props.onClick?.()}
			class="focus-ring inline-flex h-kit-control-sm items-center gap-1.5 rounded-kit px-2.5 text-body text-fg-muted hover:bg-fill hover:text-fg aria-pressed:bg-fill-strong aria-pressed:text-fg"
		>
			<span class="text-fg-subtle">{props.icon}</span>
			{props.children}
		</button>
	);
}

/** A filter that is on, removable: Status is Active ×. */
export function FilterChip(props: {
	label: string;
	value: string;
	onRemove: () => void;
}): JSX.Element {
	return (
		<span class="inline-flex h-kit-control-sm items-center gap-1 rounded-kit bg-surface pl-2.5 text-body ring-line-strong">
			<span class="text-fg-subtle">{props.label}</span>
			<span class="text-fg">{props.value}</span>
			<button
				type="button"
				aria-label={`Remove ${props.label} filter`}
				onClick={() => props.onRemove()}
				class="focus-ring ml-0.5 grid size-6 place-items-center rounded-kit-sm text-fg-faint hover:text-fg"
			>
				<CloseIcon class="size-3" />
			</button>
		</span>
	);
}
