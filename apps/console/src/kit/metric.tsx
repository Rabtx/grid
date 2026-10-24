import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";

/*
 * Figma 07 · Home → Pulse: a number with where it came from, how it moved and its bars; a few
 * numbers side by side; a bar split between who did the work.
 */

export type ChangeTone = "up" | "down" | "flat";

const CHANGE: Record<ChangeTone, string> = {
	up: "text-success",
	down: "text-danger",
	flat: "text-fg-subtle",
};

/** Bars across a period, oldest first, the latest one full strength. */
export function Bars(props: { values: readonly number[]; label: string }): JSX.Element {
	const top = () => Math.max(...props.values, 0);
	return (
		<div class="relative flex h-9 items-end gap-0.75">
			<span class="sr-only">{props.label}</span>
			<For each={props.values}>
				{(value, index) => (
					<span
						aria-hidden="true"
						class={`min-w-0 flex-1 rounded-kit-2xs ${index() === props.values.length - 1 ? "bg-accent" : "bg-accent/35"}`}
						style={{ height: `${top() > 0 ? Math.max(12, (value / top()) * 100) : 12}%` }}
					/>
				)}
			</For>
		</div>
	);
}

/**
 * One number on its card: its name and source, the value and how it moved, then its bars — or, in
 * place of all that, what to do to have it (connect a service).
 */
export function MetricCard(props: {
	label: string;
	source: string;
	value?: string;
	change?: { text: string; tone: ChangeTone };
	series?: readonly number[];
	/** In place of the number: why there is none, and what to do. */
	empty?: JSX.Element;
}): JSX.Element {
	return (
		<section class="surface-card flex min-w-0 flex-col gap-2.5 p-4">
			<div class="flex items-center justify-between gap-2 text-caption text-fg-subtle">
				<span class="truncate">{props.label}</span>
				<span class="shrink-0">{props.source}</span>
			</div>
			<Show when={props.value !== undefined} fallback={props.empty}>
				<p class="flex min-w-0 items-baseline gap-2">
					<span class="truncate text-headline text-fg tabular-nums">{props.value}</span>
					<Show when={props.change}>
						{(change) => (
							<span class={`shrink-0 text-caption tabular-nums ${CHANGE[change().tone]}`}>
								{change().text}
							</span>
						)}
					</Show>
				</p>
				<Show when={props.series?.length}>
					<Bars values={props.series ?? []} label={`${props.label} across the period`} />
				</Show>
			</Show>
		</section>
	);
}

/** Four numbers across on desktop, two on phones. */
export function MetricGrid(props: { children: JSX.Element }): JSX.Element {
	return <div class="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">{props.children}</div>;
}

/** Numbers side by side, each with what it counts under it. */
export function Figures(props: {
	items: readonly { value: string; label: string }[];
}): JSX.Element {
	return (
		<dl class="grid grid-cols-3 gap-3">
			<For each={props.items}>
				{(item) => (
					<div class="flex min-w-0 flex-col">
						<dd class="truncate text-headline text-fg tabular-nums">{item.value}</dd>
						<dt class="truncate text-caption text-fg-subtle">{item.label}</dt>
					</div>
				)}
			</For>
		</dl>
	);
}

/** One bar split between parts (agents and people), with a key under it. */
export function SplitBar(props: {
	label: string;
	parts: readonly { label: string; value: number; tone: "accent" | "violet" }[];
}): JSX.Element {
	const total = () => props.parts.reduce((sum, part) => sum + part.value, 0);
	return (
		<div class="flex flex-col gap-2">
			<span class="text-caption text-fg-subtle">{props.label}</span>
			<div class="flex h-2 gap-0.5 overflow-hidden rounded-full bg-fill-strong">
				<For each={props.parts}>
					{(part) => (
						<Show when={part.value > 0}>
							<span
								class={`h-full rounded-full ${part.tone === "accent" ? "bg-accent" : "bg-violet"}`}
								style={{ width: `${total() ? (part.value / total()) * 100 : 0}%` }}
							/>
						</Show>
					)}
				</For>
			</div>
			<div class="flex flex-wrap gap-4 text-caption text-fg-muted">
				<For each={props.parts}>
					{(part) => (
						<span class="inline-flex items-center gap-1.5">
							<span
								aria-hidden="true"
								class={`size-1.5 rounded-full ${part.tone === "accent" ? "bg-accent" : "bg-violet"}`}
							/>
							{part.label} {part.value}
						</span>
					)}
				</For>
			</div>
		</div>
	);
}

/** A line of a breakdown: what, and how much. */
export function AmountRow(props: { label: string; amount: string }): JSX.Element {
	return (
		<div class="flex items-center justify-between gap-3 border-line border-t py-2.5 text-body first:border-t-0">
			<span class="truncate text-fg">{props.label}</span>
			<span class="shrink-0 text-fg tabular-nums">{props.amount}</span>
		</div>
	);
}

/** How full a window is: accent, then warning past 70%, danger past 90% or once used up. */
function usageTone(used: number | null, limited: boolean): string {
	if (limited || (used ?? 0) >= 90) return "var(--signal-danger)";
	if ((used ?? 0) >= 70) return "var(--signal-warning)";
	return "var(--signal-accent)";
}

/**
 * One window of a plan's limits (5h, Weekly) as a small ring: how much is used, with the window's
 * name under it. Its tooltip says the share and when it resets.
 */
export function UsageRing(props: {
	window: string;
	/** The name under the ring when the window's own is long ("Week" for "Weekly · Opus"). */
	short?: string;
	/** 0–100, or null when only "allowed" is known. */
	used: number | null;
	limited?: boolean;
	/** "82% used · resets in 2h 10m". */
	detail: string;
}): JSX.Element {
	const size = 28;
	const radius = size / 2 - 2.5;
	const circumference = 2 * Math.PI * radius;
	const share = () => Math.max(0, Math.min(1, (props.used ?? 0) / 100));
	return (
		<span
			data-tooltip={`${props.window} · ${props.detail}`}
			class="flex w-9 shrink-0 flex-col items-center gap-0.5"
		>
			<span class="sr-only">{`${props.window}: ${props.detail}`}</span>
			<span aria-hidden="true" class="relative grid size-7 place-items-center">
				<svg
					width={size}
					height={size}
					viewBox={`0 0 ${size} ${size}`}
					aria-hidden="true"
					class="-rotate-90"
				>
					<circle
						cx={size / 2}
						cy={size / 2}
						r={radius}
						fill="none"
						stroke="var(--kit-fill-strong)"
						stroke-width="3"
					/>
					<circle
						cx={size / 2}
						cy={size / 2}
						r={radius}
						fill="none"
						stroke={usageTone(props.used, Boolean(props.limited))}
						stroke-width="3"
						stroke-linecap="round"
						stroke-dasharray={`${circumference}`}
						stroke-dashoffset={`${circumference * (1 - share())}`}
						class="transition-[stroke-dashoffset] duration-slow"
					/>
				</svg>
				<span class="absolute inset-0 grid place-items-center font-medium text-micro text-fg tabular-nums">
					{props.used === null ? "–" : Math.round(props.used)}
				</span>
			</span>
			<span aria-hidden="true" class="max-w-full truncate text-micro text-fg-subtle">
				{props.short ?? props.window}
			</span>
		</span>
	);
}

/** An account's windows side by side, after its agent's mark and name (the sidebar's usage). */
export function UsageStrip(props: {
	mark: JSX.Element;
	name: string;
	/** A quiet line under the name: the account, or how long ago it was read. */
	detail?: string;
	children: JSX.Element;
}): JSX.Element {
	return (
		<div class="flex min-w-0 items-center gap-2 rounded-kit-md px-2 py-1.5">
			<span class="grid size-5 shrink-0 place-items-center [&_img]:size-4 [&_svg]:size-4">
				{props.mark}
			</span>
			<span class="flex min-w-0 flex-1 flex-col">
				<span class="truncate text-caption text-fg">{props.name}</span>
				<Show when={props.detail}>
					<span class="truncate text-micro text-fg-subtle">{props.detail}</span>
				</Show>
			</span>
			<span class="flex shrink-0 items-start gap-1">{props.children}</span>
		</div>
	);
}
