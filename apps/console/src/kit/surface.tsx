import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

/** A bordered block of related content on the canvas. */
const PAD = { none: "", sm: "p-3", md: "p-4", lg: "p-5" } as const;

export function Card(props: {
	children: JSX.Element;
	/** Inner padding from the scale; none when the content draws its own (a table, a list). */
	padding?: keyof typeof PAD;
	raised?: boolean;
	/** Clip the content to the corners (lists and tables inside). */
	clip?: boolean;
	/** Layout only. */
	class?: string;
}): JSX.Element {
	return (
		<div
			class={`surface-card ${props.raised ? "shadow-raise" : ""} ${props.clip ? "overflow-hidden" : ""} ${PAD[props.padding ?? "none"]} ${props.class ?? ""}`}
		>
			{props.children}
		</div>
	);
}

/** A list of rows in a card, divided by hairlines: activity, members, settings. */
export function ListCard(props: { children: JSX.Element; class?: string }): JSX.Element {
	return (
		<div class={`surface-card divide-y divide-line overflow-hidden ${props.class ?? ""}`}>
			{props.children}
		</div>
	);
}

/** A card with a caption row on top, the way the activity and review cards read. */
export function Panel(props: {
	title: JSX.Element;
	icon?: JSX.Element;
	action?: JSX.Element;
	children: JSX.Element;
}): JSX.Element {
	return (
		<div class="overflow-hidden rounded-kit-lg bg-fill ring-line">
			<div class="flex h-9 items-center gap-2 px-3 text-caption text-fg-subtle">
				<Show when={props.icon}>{props.icon}</Show>
				<span class="min-w-0 flex-1 truncate">{props.title}</span>
				{props.action}
			</div>
			<div class="rounded-kit-lg bg-surface ring-line">{props.children}</div>
		</div>
	);
}

/** Label and value pairs, as a review or a detail pane lists them. */
export function DescriptionList(props: {
	items: readonly { label: string; value: JSX.Element }[];
}): JSX.Element {
	return (
		<dl class="divide-y divide-line">
			{props.items.map((item) => (
				<div class="grid grid-cols-[minmax(7rem,40%)_1fr] items-center gap-3 px-3 py-2.5 text-body">
					<dt class="text-fg-subtle">{item.label}</dt>
					<dd class="min-w-0 text-fg">{item.value}</dd>
				</div>
			))}
		</dl>
	);
}

/** Nothing here yet: one line saying so, and the way forward. */
export function EmptyState(props: {
	icon?: JSX.Element;
	title: string;
	description?: string;
	action?: JSX.Element;
}): JSX.Element {
	return (
		<div class="flex flex-col items-center gap-3 px-6 py-12 text-center">
			<Show when={props.icon}>
				<span class="grid size-10 place-items-center rounded-kit-lg bg-fill text-fg-subtle">
					{props.icon}
				</span>
			</Show>
			<div class="flex max-w-xs flex-col gap-1">
				<p class="font-medium text-body-lg text-fg">{props.title}</p>
				<Show when={props.description}>
					<p class="text-body text-fg-subtle">{props.description}</p>
				</Show>
			</div>
			{props.action}
		</div>
	);
}

/** A placeholder with the shape of what is loading. */
export function Skeleton(props: { class?: string; circle?: boolean }): JSX.Element {
	return (
		<span
			aria-hidden="true"
			class={`block animate-pulse bg-fill-strong ${props.circle ? "rounded-full" : "rounded-kit"} ${props.class ?? "h-4"}`}
		/>
	);
}

/** A hover tooltip for pointer devices (touch has no hover to show it). */
export function Tooltip(props: {
	label: string;
	children: JSX.Element;
	side?: "top" | "bottom";
}): JSX.Element {
	return (
		<span class="group/tip relative inline-flex">
			{props.children}
			<span
				role="tooltip"
				class={`pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-kit bg-inverse px-2 py-1 text-caption text-inverse-fg opacity-0 transition-opacity duration-fast group-hover/tip:opacity-100 group-hover/tip:delay-300 pointer-coarse:hidden ${props.side === "bottom" ? "top-full mt-1.5" : "bottom-full mb-1.5"}`}
			>
				{props.label}
			</span>
		</span>
	);
}
