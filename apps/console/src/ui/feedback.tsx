import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import { AlertIcon } from "./icons";

/** Small caption above a group: 10–11px, uppercase, the one place tracking is widened. */
export function Caption(props: { children: JSX.Element; class?: string }): JSX.Element {
	return (
		<span
			class={`font-semibold text-ink/45 text-ui-caption uppercase tracking-wide ${props.class ?? ""}`}
		>
			{props.children}
		</span>
	);
}

/** A label chip, optionally led by a dot in a signal or status colour class. */
export function Chip(props: { children: JSX.Element; dot?: string }): JSX.Element {
	return (
		<span class="inline-flex h-5 max-w-full items-center gap-1 rounded-sm bg-ink/8 px-1.5 text-ink/70 text-ui-xs">
			<Show when={props.dot}>
				{(dot) => <span class={`size-1.5 shrink-0 rounded-full ${dot()}`} aria-hidden="true" />}
			</Show>
			<span class="truncate">{props.children}</span>
		</span>
	);
}

/**
 * Empty state: one short sentence, centred, low ink — no big heading, no illustration.
 * `action` is an optional next step.
 */
export function EmptyState(props: {
	title: string;
	description?: string;
	action?: JSX.Element;
}): JSX.Element {
	return (
		<div class="flex flex-col items-center gap-1.5 px-4 py-12 text-center">
			<p class="font-medium text-ink/70 text-ui">{props.title}</p>
			<Show when={props.description}>
				<p class="max-w-sm text-ink/50 text-ui-sm">{props.description}</p>
			</Show>
			<Show when={props.action}>
				<div class="pt-2">{props.action}</div>
			</Show>
		</div>
	);
}

/** Inline error strip with the concrete reason; `action` usually retries. */
export function ErrorNotice(props: { message: string; action?: JSX.Element }): JSX.Element {
	return (
		<div
			role="alert"
			class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-danger/10 px-3 py-2.5 text-danger text-ui-sm"
		>
			<AlertIcon class="size-4 shrink-0" />
			<span class="min-w-0 flex-1">{props.message}</span>
			<Show when={props.action}>{props.action}</Show>
		</div>
	);
}

/** Placeholder block for first loads; pulses unless the user asked for reduced motion. */
export function Skeleton(props: { class?: string }): JSX.Element {
	return (
		<div
			aria-hidden="true"
			class={`animate-pulse rounded-md bg-ink/6 motion-reduce:animate-none ${props.class ?? ""}`}
		/>
	);
}
