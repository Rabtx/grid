import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

export type Tone = "neutral" | "success" | "warning" | "danger" | "accent";

const TONES: Record<Tone, string> = {
	neutral: "bg-fill-strong text-fg-muted",
	success: "bg-success/10 text-success",
	warning: "bg-warning/12 text-warning",
	danger: "bg-danger/10 text-danger",
	accent: "bg-accent/10 text-accent",
};

/** A small status label: Active, Expired, New. */
export function Badge(props: { tone?: Tone; dot?: boolean; children: JSX.Element }): JSX.Element {
	return (
		<span
			class={`inline-flex h-5 shrink-0 items-center gap-1 rounded-kit-sm px-1.5 font-medium text-caption ${TONES[props.tone ?? "neutral"]}`}
		>
			<Show when={props.dot}>
				<span class="size-1.5 rounded-full bg-current" />
			</Show>
			{props.children}
		</span>
	);
}

/** A count beside a nav item: needs attention, so it carries the danger colour. */
export function Count(props: { children: JSX.Element; quiet?: boolean }): JSX.Element {
	return (
		<span
			class={`inline-grid h-4 min-w-4 place-items-center rounded-full px-1 font-medium text-micro tabular-nums ${props.quiet ? "bg-fill-strong text-fg-subtle" : "bg-danger text-white"}`}
		>
			{props.children}
		</span>
	);
}

/** A key on the keyboard, for hints: ⌘K, Esc. */
export function Kbd(props: { children: JSX.Element }): JSX.Element {
	return (
		<kbd class="inline-grid h-5 min-w-5 place-items-center rounded-kit-xs px-1 font-kit text-caption text-fg-subtle ring-line-strong pointer-coarse:hidden">
			{props.children}
		</kbd>
	);
}
