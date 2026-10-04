import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";

import { CheckIcon } from "./icons";

/*
 * Figma 24 · Connectors: a connected service as a card, how healthy it is, the steps of
 * connecting one, and what a server answered when it was tried.
 */

export type HealthTone = "success" | "warning" | "danger" | "neutral";

const HEALTH: Record<HealthTone, string> = {
	success: "text-success",
	warning: "text-warning",
	danger: "text-danger",
	neutral: "text-fg-subtle",
};

/** "● Healthy", "● Token expires in 3 days": a dot and a word in the signal's colour. */
export function HealthLabel(props: { tone: HealthTone; children: JSX.Element }): JSX.Element {
	return (
		<span
			class={`inline-flex min-w-0 shrink-0 items-center gap-1.5 text-caption ${HEALTH[props.tone]}`}
		>
			<span aria-hidden="true" class="size-1.5 shrink-0 rounded-full bg-current" />
			<span class="truncate">{props.children}</span>
		</span>
	);
}

/**
 * A connected service: its tile, name and kind, how it is doing, what Grid uses it for, and — on a
 * quiet strip — what agents may do with it, with an action when it needs one (Reconnect).
 */
export function ConnectorCard(props: {
	glyph: JSX.Element;
	name: string;
	kind: string;
	health: JSX.Element;
	blurb: string;
	summary: string;
	action?: JSX.Element;
	href: string;
}): JSX.Element {
	return (
		<div class="relative flex min-w-0 flex-col gap-3 rounded-kit-lg bg-surface p-4 ring-line transition-colors duration-fast hover:bg-fill/40">
			<div class="flex min-w-0 items-center gap-3">
				{props.glyph}
				<div class="min-w-0 flex-1">
					<a
						href={props.href}
						class="focus-ring block truncate rounded-kit-xs text-body-lg text-fg after:absolute after:inset-0 after:content-['']"
					>
						{props.name}
					</a>
					<p class="truncate text-caption text-fg-subtle">{props.kind}</p>
				</div>
				{props.health}
			</div>
			<p class="truncate text-body text-fg">{props.blurb}</p>
			<div class="flex min-h-8 items-center gap-2 rounded-kit bg-fill px-2.5 py-1.5 text-caption text-fg-muted">
				<span class="min-w-0 flex-1 truncate">Agents: {props.summary}</span>
				<Show when={props.action}>
					<span class="relative z-10 shrink-0">{props.action}</span>
				</Show>
			</div>
		</div>
	);
}

/** Two cards to a row from md, one on phones. */
export function ConnectorGrid(props: { children: JSX.Element }): JSX.Element {
	return <div class="grid gap-3 md:grid-cols-2">{props.children}</div>;
}

/** Where a flow is: done steps ticked, the current one numbered in the accent, a rule between. */
export function StepTrail(props: { steps: readonly string[]; current: number }): JSX.Element {
	return (
		<ol class="flex min-w-0 flex-wrap items-center gap-2 text-body">
			<For each={props.steps}>
				{(step, index) => (
					<li class="flex min-w-0 items-center gap-2">
						<Show when={index() > 0}>
							<span aria-hidden="true" class="h-px w-6 shrink-0 bg-line-strong" />
						</Show>
						<span
							class={`grid size-4 shrink-0 place-items-center rounded-full text-micro ${
								index() < props.current
									? "bg-success text-white"
									: index() === props.current
										? "bg-accent text-white"
										: "bg-fill-strong text-fg-subtle"
							}`}
						>
							<Show when={index() < props.current} fallback={index() + 1}>
								<CheckIcon class="size-2.5" />
							</Show>
						</span>
						<span
							aria-current={index() === props.current ? "step" : undefined}
							class={index() === props.current ? "text-fg" : "text-fg-muted"}
						>
							{step}
						</span>
					</li>
				)}
			</For>
		</ol>
	);
}

/** What a server answered when it was tried: connected and its tools, or why not. */
export function ProbeResult(props: {
	ok: boolean;
	title: string;
	detail?: string;
	tools?: readonly string[];
}): JSX.Element {
	return (
		<output
			class={`flex flex-col gap-2.5 rounded-kit-lg p-3.5 ${props.ok ? "ring-[1.5px] ring-success" : "ring-[1.5px] ring-danger"}`}
		>
			<div class="flex items-center gap-2">
				<span
					class={`grid size-5 shrink-0 place-items-center rounded-full text-white ${props.ok ? "bg-success" : "bg-danger"}`}
				>
					<Show when={props.ok} fallback={<span class="text-micro">!</span>}>
						<CheckIcon class="size-3" />
					</Show>
				</span>
				<span class="min-w-0 flex-1 truncate text-body text-fg">{props.title}</span>
				<Show when={props.detail}>
					<span class="shrink-0 text-caption text-fg-subtle tabular-nums">{props.detail}</span>
				</Show>
			</div>
			<Show when={props.tools?.length}>
				<div class="flex flex-wrap gap-1.5">
					<For each={props.tools}>
						{(tool) => (
							<span class="rounded-kit-sm bg-fill px-2 py-0.5 font-mono text-caption text-fg-muted">
								{tool}
							</span>
						)}
					</For>
				</div>
			</Show>
		</output>
	);
}

/** A connector at the top of its page: its tile, name and health, a line about it, its actions. */
export function ConnectorHeader(props: {
	glyph: JSX.Element;
	name: string;
	health: JSX.Element;
	meta: string;
	actions?: JSX.Element;
}): JSX.Element {
	return (
		<div class="flex min-w-0 items-center gap-3 rounded-kit-lg bg-surface p-4 ring-line">
			{props.glyph}
			<div class="min-w-0 flex-1">
				<p class="flex min-w-0 items-center gap-2">
					<span class="truncate text-body-lg text-fg">{props.name}</span>
					{props.health}
				</p>
				<p class="truncate text-caption text-fg-subtle">{props.meta}</p>
			</div>
			<Show when={props.actions}>
				<div class="flex shrink-0 items-center gap-2 max-md:hidden">{props.actions}</div>
			</Show>
		</div>
	);
}

/** "Powers  Board sync  Pull requests …": a quiet label and the things in outlined chips. */
export function ChipRow(props: { label: string; items: readonly string[] }): JSX.Element {
	return (
		<div class="flex min-w-0 flex-wrap items-center gap-2">
			<span class="text-caption text-fg-subtle">{props.label}</span>
			<For each={props.items}>
				{(item) => (
					<span class="surface-outline rounded-kit-md px-2.5 py-1 text-caption text-fg-muted">
						{item}
					</span>
				)}
			</For>
		</div>
	);
}
