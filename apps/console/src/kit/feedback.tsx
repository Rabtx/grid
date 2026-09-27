import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import { AlertIcon, CheckCircleIcon, CloseIcon, InfoIcon, SpinnerIcon } from "./icons";

import type { Tone } from "./badge";

const ALERT: Record<Exclude<Tone, "neutral">, { box: string; icon: () => JSX.Element }> = {
	accent: { box: "bg-accent/6 text-accent", icon: () => <InfoIcon class="size-4" /> },
	success: { box: "bg-success/8 text-success", icon: () => <CheckCircleIcon class="size-4" /> },
	warning: { box: "bg-warning/10 text-warning", icon: () => <AlertIcon class="size-4" /> },
	danger: { box: "bg-danger/8 text-danger", icon: () => <AlertIcon class="size-4" /> },
};

/**
 * A message inside the page: what happened in one line, the detail under it, an action to put it
 * right. Colour carries the kind; the text stays readable ink.
 */
export function Alert(props: {
	tone?: Exclude<Tone, "neutral">;
	title: string;
	children?: JSX.Element;
	action?: JSX.Element;
	onDismiss?: () => void;
}): JSX.Element {
	const look = () => ALERT[props.tone ?? "accent"];
	return (
		// A problem interrupts (role alert); anything else is announced politely (the output's status).
		<output
			role={props.tone === "danger" ? "alert" : undefined}
			class={`flex items-start gap-3 rounded-kit-lg px-3.5 py-3 ${look().box}`}
		>
			<span class="mt-px shrink-0">{look().icon()}</span>
			<div class="flex min-w-0 flex-1 flex-col gap-0.5">
				<p class="font-medium text-body text-fg">{props.title}</p>
				<Show when={props.children}>
					<div class="text-body text-fg-muted">{props.children}</div>
				</Show>
				<Show when={props.action}>
					<div class="flex gap-2 pt-1.5">{props.action}</div>
				</Show>
			</div>
			<Show when={props.onDismiss}>
				<button
					type="button"
					aria-label="Dismiss"
					onClick={() => props.onDismiss?.()}
					class="focus-ring -mt-0.5 -mr-1 grid size-6 shrink-0 place-items-center rounded-kit-sm text-fg-subtle hover:bg-fill-strong hover:text-fg"
				>
					<CloseIcon class="size-3.5" />
				</button>
			</Show>
		</output>
	);
}

/** A strip across the top of a screen: offline, an update, a lost connection. */
export function Banner(props: {
	children: JSX.Element;
	action?: JSX.Element;
	/** neutral is the dark strip; quiet is a soft grey one that says without shouting. */
	tone?: "neutral" | "accent" | "quiet";
}): JSX.Element {
	const tone = () =>
		({
			neutral: "bg-inverse text-inverse-fg",
			accent: "bg-accent text-white",
			quiet: "bg-fill-strong text-fg-muted",
		})[props.tone ?? "neutral"];
	return (
		<output
			aria-live="polite"
			class={`flex min-h-9 items-center justify-center gap-3 px-4 py-1.5 text-body ${tone()}`}
		>
			<span class="min-w-0 truncate">{props.children}</span>
			{props.action}
		</output>
	);
}

/** Work in progress. */
export function Spinner(props: { class?: string; label?: string }): JSX.Element {
	return (
		<output
			aria-label={props.label ?? "Loading"}
			class="inline-grid place-items-center text-fg-subtle"
		>
			<SpinnerIcon class={`animate-spin ${props.class ?? "size-4"}`} />
		</output>
	);
}

const DOT = {
	online: "bg-success",
	busy: "bg-warning",
	waiting: "bg-warning",
	offline: "bg-fg-faint",
	error: "bg-danger",
	running: "bg-accent animate-pulse",
	unread: "bg-accent",
} as const;

/** Presence or state as a dot: a machine online, an agent running or waiting, something unread. */
export function StatusDot(props: {
	status: keyof typeof DOT;
	size?: "sm" | "md";
	label?: string;
}): JSX.Element {
	return (
		<span
			title={props.label}
			aria-label={props.label}
			aria-hidden={props.label ? undefined : "true"}
			class={`inline-block shrink-0 rounded-full ${props.size === "sm" ? "size-1.5" : "size-2"} ${DOT[props.status]}`}
		/>
	);
}

/** How far along: a thin bar. */
export function ProgressBar(props: {
	value: number;
	tone?: "accent" | "success" | "warning" | "danger";
	label?: string;
}): JSX.Element {
	const color = () =>
		({ accent: "bg-accent", success: "bg-success", warning: "bg-warning", danger: "bg-danger" })[
			props.tone ?? "accent"
		];
	return (
		<div class="h-1.5 w-full overflow-hidden rounded-full bg-fill-strong">
			<span class="sr-only">
				{props.label ? `${props.label}: ` : ""}
				{Math.round(props.value * 100)}%
			</span>
			<div
				class={`h-full rounded-full transition-[width] duration-slow ease-out-grid ${color()}`}
				style={{ width: `${Math.max(0, Math.min(1, props.value)) * 100}%` }}
			/>
		</div>
	);
}

/** Usage against a limit, drawn as ticks: spend, credits, seats. Turns warning, then danger. */
export function UsageBar(props: { value: number; ticks?: number; label?: string }): JSX.Element {
	const ticks = () => props.ticks ?? 24;
	const filled = () => Math.round(Math.max(0, Math.min(1, props.value)) * ticks());
	const color = () =>
		props.value >= 0.9 ? "bg-danger" : props.value >= 0.7 ? "bg-warning" : "bg-accent";
	return (
		<div class="flex h-3.5 items-stretch gap-[2px]">
			<span class="sr-only">
				{props.label ? `${props.label}: ` : ""}
				{Math.round(props.value * 100)}%
			</span>
			{Array.from({ length: ticks() }, (_, index) => (
				<span class={`flex-1 rounded-[1px] ${index < filled() ? color() : "bg-fill-strong"}`} />
			))}
		</div>
	);
}

/** Three dots rising in turn: an agent is working right now. */
export function WorkingDots(props: { label?: string }): JSX.Element {
	return (
		<span class="working-dots shrink-0 text-fg-subtle" title={props.label ?? "Working"}>
			<i />
			<i />
			<i />
		</span>
	);
}

/** Text with a light sweeping across it while something is live (a running thread's title). */
export function Shimmer(props: { active: boolean; children: JSX.Element }): JSX.Element {
	return <span class={props.active ? "thread-running" : ""}>{props.children}</span>;
}

/**
 * A message that floats over the app: a pill at the top (offline), or a card at the bottom with
 * an action (a new version to reload into). Announced politely to screen readers.
 */
export function FloatingNotice(props: {
	position: "top" | "bottom";
	children: JSX.Element;
	action?: JSX.Element;
}): JSX.Element {
	return (
		<output
			aria-live="polite"
			class={
				props.position === "top"
					? "fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.5rem)] z-50 mx-auto block w-fit rounded-full bg-inverse px-3 py-1 text-caption text-inverse-fg shadow-float"
					: "fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-center gap-3 rounded-kit-xl bg-surface-raised px-4 py-3 shadow-float"
			}
		>
			<span class={props.position === "bottom" ? "min-w-0 flex-1 text-body text-fg" : ""}>
				{props.children}
			</span>
			{props.action}
		</output>
	);
}

/** A hairline across the top of a screen that pulses while its data refreshes. */
export function LoadingBar(props: { active: boolean }): JSX.Element {
	return (
		<div
			aria-hidden="true"
			class={`h-0.5 rounded-full ${props.active ? "animate-pulse bg-accent" : "bg-transparent"}`}
		/>
	);
}
