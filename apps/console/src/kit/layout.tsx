import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import { variants } from "./variants";

// Gaps come from one short scale, so spacing stays rhythmic everywhere.
const GAP = {
	0: "gap-0",
	0.5: "gap-0.5",
	1: "gap-1",
	1.5: "gap-1.5",
	2: "gap-2",
	2.5: "gap-2.5",
	3: "gap-3",
	4: "gap-4",
	5: "gap-5",
	6: "gap-6",
	8: "gap-8",
	10: "gap-10",
} as const;
type Gap = keyof typeof GAP;

const stack = variants({
	base: "flex min-w-0 flex-col",
	variants: {
		align: { stretch: "", start: "items-start", center: "items-center", end: "items-end" },
	},
	defaults: { align: "stretch" },
});

/** Things one under another, a fixed gap apart. */
export function Stack(props: {
	gap?: Gap;
	align?: "stretch" | "start" | "center" | "end";
	/** Layout only: width, flex, grid placement, margin. */
	class?: string;
	children: JSX.Element;
}): JSX.Element {
	return (
		<div
			class={stack({ align: props.align, class: `${GAP[props.gap ?? 3]} ${props.class ?? ""}` })}
		>
			{props.children}
		</div>
	);
}

const row = variants({
	base: "flex min-w-0",
	variants: {
		align: {
			center: "items-center",
			start: "items-start",
			end: "items-end",
			baseline: "items-baseline",
			stretch: "items-stretch",
		},
		justify: {
			start: "",
			between: "justify-between",
			end: "justify-end",
			center: "justify-center",
		},
		wrap: { no: "", yes: "flex-wrap" },
	},
	defaults: { align: "center", justify: "start", wrap: "no" },
});

/** Things side by side, a fixed gap apart, centred on one line unless told otherwise. */
export function Row(props: {
	gap?: Gap;
	align?: "center" | "start" | "end" | "baseline" | "stretch";
	justify?: "start" | "between" | "end" | "center";
	wrap?: boolean;
	/** Layout only: width, flex, grid placement, margin. */
	class?: string;
	children: JSX.Element;
}): JSX.Element {
	return (
		<div
			class={row({
				align: props.align,
				justify: props.justify,
				wrap: props.wrap ? "yes" : "no",
				class: `${GAP[props.gap ?? 2]} ${props.class ?? ""}`,
			})}
		>
			{props.children}
		</div>
	);
}

/** Takes the free space in a row, pushing what follows to the end. */
export function Spacer(): JSX.Element {
	return <span aria-hidden="true" class="flex-1" />;
}

/** A hairline between groups. */
export function Divider(props: { vertical?: boolean }): JSX.Element {
	return (
		<span
			aria-hidden="true"
			class={props.vertical ? "w-px self-stretch bg-line" : "hairline-fade h-px w-full shrink-0"}
		/>
	);
}

const GRID = {
	1: "grid-cols-1",
	2: "grid-cols-1 md:grid-cols-2",
	3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
	4: "grid-cols-2 md:grid-cols-3 lg:grid-cols-4",
} as const;

/** Equal columns that fold down on phones: 1 column there, `columns` from desktop. */
export function Grid(props: {
	columns: keyof typeof GRID;
	gap?: Gap;
	class?: string;
	children: JSX.Element;
}): JSX.Element {
	return (
		<div class={`grid min-w-0 ${GRID[props.columns]} ${GAP[props.gap ?? 4]} ${props.class ?? ""}`}>
			{props.children}
		</div>
	);
}

const WIDTH = {
	sm: "max-w-xl",
	md: "max-w-2xl",
	lg: "max-w-4xl",
	xl: "max-w-6xl",
	full: "",
} as const;

/**
 * A screen's scrolling content: a centred column of a set width with the page gutters (16px on
 * phones, 32px on desktop). Screens put a PageHeader and Sections inside.
 */
export function Page(props: { width?: keyof typeof WIDTH; children: JSX.Element }): JSX.Element {
	return (
		<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-6 pb-10 md:px-8 md:pt-8">
			<div class={`mx-auto flex w-full flex-col gap-8 ${WIDTH[props.width ?? "md"]}`}>
				{props.children}
			</div>
		</div>
	);
}

/** The title of a screen, a line on what it is for, and its main actions. */
export function PageHeader(props: {
	title: string;
	description?: string;
	actions?: JSX.Element;
}): JSX.Element {
	return (
		<header class="flex flex-wrap items-end justify-between gap-3">
			<div class="flex min-w-0 flex-col gap-0.5">
				<h1 class="font-medium text-fg text-headline">{props.title}</h1>
				<Show when={props.description}>
					<p class="text-body text-fg-subtle">{props.description}</p>
				</Show>
			</div>
			<Show when={props.actions}>
				<div class="flex shrink-0 items-center gap-2">{props.actions}</div>
			</Show>
		</header>
	);
}

/** A part of a screen: an optional title and description, an action, then its content. */
export function Section(props: {
	title?: string;
	description?: string;
	action?: JSX.Element;
	gap?: Gap;
	children: JSX.Element;
}): JSX.Element {
	return (
		<section class={`flex min-w-0 flex-col ${GAP[props.gap ?? 3]}`}>
			<Show when={props.title || props.action}>
				<div class="flex items-end justify-between gap-3">
					<div class="flex min-w-0 flex-col gap-0.5">
						<Show when={props.title}>
							<h2 class="font-medium text-body-lg text-fg">{props.title}</h2>
						</Show>
						<Show when={props.description}>
							<p class="text-body text-fg-subtle">{props.description}</p>
						</Show>
					</div>
					{props.action}
				</div>
			</Show>
			{props.children}
		</section>
	);
}
