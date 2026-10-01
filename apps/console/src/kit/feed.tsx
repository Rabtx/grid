import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import { variants } from "./variants";

/** The signal a glyph tile is tinted with (the Figma Inbox glyphs). */
export type FeedTone = "neutral" | "accent" | "violet" | "success" | "warning" | "danger";

const tile = variants({
	base: "grid shrink-0 place-items-center",
	variants: {
		tone: {
			neutral: "bg-fill-strong text-fg-muted ring-line",
			accent: "tint-accent",
			violet: "tint-violet",
			success: "tint-success",
			warning: "tint-warning",
			danger: "tint-danger",
		},
		size: {
			md: "size-7 rounded-kit [&_svg]:size-3.5",
			lg: "size-9 rounded-kit-lg [&_svg]:size-4",
		},
	},
	defaults: { tone: "neutral", size: "md" },
});

/** A glyph on a tile tinted with its signal: what kind of thing a row is, at a glance. */
export function ToneTile(props: {
	tone?: FeedTone;
	size?: "md" | "lg";
	children: JSX.Element;
}): JSX.Element {
	return (
		<span aria-hidden="true" class={tile({ tone: props.tone, size: props.size })}>
			{props.children}
		</span>
	);
}

/** A quiet group label in a list ("Today", "Yesterday"): 12px medium, subtle. */
export function FeedGroup(props: { children: JSX.Element; first?: boolean }): JSX.Element {
	return (
		<h3
			class={`px-3 pb-1 font-medium text-caption text-fg-subtle ${props.first ? "pt-1" : "pt-3"}`}
		>
			{props.children}
		</h3>
	);
}

/**
 * One item in a feed (the Figma Inbox item): its tinted glyph, a title, a meta line and a body,
 * with the time and an unread dot on the right. Selected, it sits on the flat selection grey.
 */
export function FeedRow(props: {
	tone: FeedTone;
	icon: JSX.Element;
	title: string;
	meta?: JSX.Element;
	body?: JSX.Element;
	time: string;
	unread?: boolean;
	current?: boolean;
	/** A stable id for finding the row from code (moving the selection with keys). */
	id?: string;
	/** Below the text: a row's own actions (Open diff, Review) on phones. */
	footer?: JSX.Element;
	onClick: () => void;
}): JSX.Element {
	return (
		<div class="rounded-kit transition-colors duration-fast hover:bg-fill-strong has-[[aria-current=true]]:bg-selection">
			<button
				type="button"
				aria-current={props.current ? "true" : undefined}
				data-feed-id={props.id}
				onClick={() => props.onClick()}
				class="focus-ring flex w-full min-w-0 items-start gap-3 rounded-kit p-3 text-left"
			>
				<ToneTile tone={props.tone}>{props.icon}</ToneTile>
				<span class="flex min-w-0 flex-1 flex-col gap-0.5">
					<span class="flex min-w-0 items-baseline gap-2">
						<span class="min-w-0 flex-1 truncate font-medium text-body text-fg">{props.title}</span>
						<span class="flex shrink-0 items-center gap-1.5 text-caption text-fg-subtle tabular-nums">
							{props.time}
							<Show when={props.unread}>
								<span class="size-1.5 rounded-full bg-accent" aria-hidden="true" />
								<span class="sr-only">Unread</span>
							</Show>
						</span>
					</span>
					<Show when={props.meta}>
						<span class="truncate text-caption text-fg-subtle">{props.meta}</span>
					</Show>
					<Show when={props.body}>
						<span class="line-clamp-2 text-caption text-fg-muted">{props.body}</span>
					</Show>
				</span>
			</button>
			<Show when={props.footer}>
				<div class="flex gap-2 pr-3 pb-3 pl-13">{props.footer}</div>
			</Show>
		</div>
	);
}

/** A quiet line of state on the fill (the Figma "paused until you answer" strip). */
export function InfoStrip(props: { children: JSX.Element; trailing?: JSX.Element }): JSX.Element {
	return (
		<div class="flex items-center gap-2 rounded-kit bg-fill px-3 py-2 text-caption">
			<span class="min-w-0 flex-1 truncate text-fg-muted">{props.children}</span>
			<Show when={props.trailing}>
				<span class="shrink-0 text-fg-subtle">{props.trailing}</span>
			</Show>
		</div>
	);
}
