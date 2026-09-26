import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import { AlertIcon, CheckCircleIcon, CloseIcon, InfoIcon, SpinnerIcon } from "../ui/icons";

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
		<output class={`flex items-start gap-3 rounded-kit-lg px-3.5 py-3 ${look().box}`}>
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

/** A strip across the top of a screen: offline, an update, a trial ending. */
export function Banner(props: {
	children: JSX.Element;
	action?: JSX.Element;
	tone?: "neutral" | "accent";
}): JSX.Element {
	return (
		<div
			class={`flex min-h-10 items-center justify-center gap-3 px-4 py-1.5 text-body ${props.tone === "accent" ? "bg-accent text-white" : "bg-inverse text-inverse-fg"}`}
		>
			<span class="min-w-0 truncate">{props.children}</span>
			{props.action}
		</div>
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

const DOT: Record<string, string> = {
	online: "bg-success",
	busy: "bg-warning",
	offline: "bg-fg-faint",
	error: "bg-danger",
	running: "bg-accent animate-pulse",
};

/** Presence or state as a dot: a machine online, an agent running. */
export function StatusDot(props: { status: keyof typeof DOT; label?: string }): JSX.Element {
	return (
		<span
			role={props.label ? "img" : undefined}
			aria-label={props.label}
			class={`inline-block size-2 shrink-0 rounded-full ${DOT[props.status]}`}
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
