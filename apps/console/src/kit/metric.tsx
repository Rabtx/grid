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
