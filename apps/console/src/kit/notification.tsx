import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import { WorkingDots } from "./feedback";
import { CloseIcon } from "./icons";

/*
 * Figma 26 · Notifications: what needs you while you are elsewhere in Grid — an agent asking to
 * run something, a pull request ready — as cards stacked at the bottom right on desktop and one
 * banner at the top on phones, each answerable where it is.
 */

/** Where notifications sit: the top of a phone, the bottom right of a desktop. */
export function NotificationStack(props: { children: JSX.Element }): JSX.Element {
	return (
		<section
			aria-label="Notifications"
			aria-live="polite"
			class="pointer-events-none fixed inset-x-3 top-[calc(env(safe-area-inset-top)+0.5rem)] z-50 flex flex-col gap-2 md:inset-x-auto md:top-auto md:right-6 md:bottom-6 md:w-96"
		>
			{props.children}
		</section>
	);
}

/**
 * One notification: who or what it is from, what it says, when, and its buttons (Allow, Deny,
 * Open). Closing it only hides it here; what it is about still waits in the Inbox.
 */
export function NotificationCard(props: {
	icon: JSX.Element;
	title: string;
	body: string;
	time: string;
	actions?: JSX.Element;
	onDismiss: () => void;
}): JSX.Element {
	return (
		<article class="surface-card pointer-events-auto flex min-w-0 gap-3 p-4 starting:translate-y-2 starting:opacity-0 transition-[translate,opacity] duration-base ease-out-grid">
			<span
				aria-hidden="true"
				class="grid size-8 shrink-0 place-items-center rounded-kit bg-fill text-fg-muted [&_img]:size-4 [&_svg]:size-4"
			>
				{props.icon}
			</span>
			<div class="flex min-w-0 flex-1 flex-col gap-0.5">
				<div class="flex min-w-0 items-baseline gap-2">
					<h3 class="min-w-0 flex-1 truncate font-medium text-body text-fg">{props.title}</h3>
					<span class="shrink-0 text-caption text-fg-subtle">{props.time}</span>
				</div>
				<p class="line-clamp-2 text-caption text-fg-subtle">{props.body}</p>
				<Show when={props.actions}>
					<div class="mt-2 flex flex-wrap items-center gap-2">{props.actions}</div>
				</Show>
			</div>
			<button
				type="button"
				aria-label="Hide"
				onClick={() => props.onDismiss()}
				class="focus-ring -mt-1 -mr-1 grid size-6 shrink-0 place-items-center rounded-kit text-fg-faint transition-colors duration-fast hover:bg-fill hover:text-fg pointer-coarse:size-11 [&_svg]:size-3.5"
			>
				<CloseIcon />
			</button>
		</article>
	);
}

/** While Grid cannot reach a machine (Figma 27 · Reconnecting): a pill at the top saying so. */
export function ReconnectingNotice(props: { title: string; detail: string }): JSX.Element {
	return (
		<output
			aria-live="polite"
			class="surface-card fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] z-50 mx-auto flex w-fit max-w-[calc(100%-1.5rem)] items-center gap-2.5 rounded-full px-4 py-2"
		>
			<WorkingDots label={props.title} />
			<span class="truncate font-medium text-body text-fg">{props.title}</span>
			<span class="truncate text-caption text-fg-subtle max-sm:hidden">{props.detail}</span>
		</output>
	);
}

/** A quiet line that something is on its way (Waiting for a runner…), dots first. */
export function WaitingLine(props: { children: JSX.Element }): JSX.Element {
	return (
		<output aria-live="polite" class="flex items-center gap-2 text-caption text-fg-subtle">
			<WorkingDots />
			{props.children}
		</output>
	);
}
