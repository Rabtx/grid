import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";

import type { FeedTone } from "./feed";
import { CheckIcon, ChevronRightIcon, CloseIcon } from "./icons";

/*
 * Figma 19 · Ship: environments, pipelines and previews in the panel; an environment's health,
 * what can be promoted and its deploys; a pipeline's checks and why one failed; previews as cards.
 */

const DOT: Record<FeedTone, string> = {
	neutral: "bg-fg-faint",
	accent: "bg-accent",
	violet: "bg-violet",
	success: "bg-success",
	warning: "bg-warning",
	danger: "bg-danger",
};

/** Ship's page: one scrolling column, wide on desktop. */
export function ShipPage(props: { children: JSX.Element }): JSX.Element {
	return (
		<div class="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
			<div class="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 pt-4 pb-10 md:px-10 md:pt-10">
				{props.children}
			</div>
		</div>
	);
}

/** A group in the panel or the phone's list: Environments, Pipelines. */
export function ShipGroupLabel(props: { children: JSX.Element; phone?: boolean }): JSX.Element {
	return (
		<h3
			class={`font-normal text-caption text-fg-subtle ${props.phone ? "px-1 pt-4 pb-2" : "px-2 pt-3 pb-1"}`}
		>
			{props.children}
		</h3>
	);
}

/**
 * One environment, pipeline or source in the panel: its signal dot, its name, and a line of state.
 * A link with `href`, a button with `onClick` (choosing on the page), otherwise just the figure.
 */
export function ShipPanelRow(props: {
	href?: string;
	onClick?: () => void;
	title: string;
	line: string;
	tone: FeedTone;
	current?: boolean;
}): JSX.Element {
	const ROW =
		"focus-ring flex w-full min-w-0 items-start gap-2.5 rounded-kit-md px-2 py-2 text-left transition-colors duration-fast";
	const body = () => (
		<>
			<span aria-hidden="true" class={`mt-1.5 size-2 shrink-0 rounded-full ${DOT[props.tone]}`} />
			<span class="flex min-w-0 flex-1 flex-col gap-0.5">
				<span class="truncate text-body text-fg">{props.title}</span>
				<span class="line-clamp-2 text-caption text-fg-subtle">{props.line}</span>
			</span>
		</>
	);
	return (
		<Show
			when={props.href}
			fallback={
				<Show when={props.onClick} fallback={<div class={ROW}>{body()}</div>}>
					{(choose) => (
						<button
							type="button"
							aria-pressed={props.current ? "true" : "false"}
							onClick={() => choose()()}
							class={`${ROW} hover:bg-fill aria-pressed:bg-fill-strong`}
						>
							{body()}
						</button>
					)}
				</Show>
			}
		>
			{(href) => (
				<a
					href={href()}
					aria-current={props.current ? "page" : undefined}
					class={`${ROW} hover:bg-fill aria-[current=page]:bg-fill-strong`}
				>
					{body()}
				</a>
			)}
		</Show>
	);
}

/** The phone's list: rows on one card. */
export function ShipListCard(props: { children: JSX.Element }): JSX.Element {
	return (
		<div class="surface-card flex flex-col divide-y divide-line overflow-hidden">
			{props.children}
		</div>
	);
}

/** A row on the phone's list: dot, name and state, then its action or a chevron. */
export function ShipListRow(props: {
	href: string;
	title: string;
	line: string;
	tone: FeedTone;
	action?: JSX.Element;
}): JSX.Element {
	return (
		<div class="flex min-w-0 items-center gap-3 pr-4">
			<a
				href={props.href}
				class="focus-ring flex min-h-16 min-w-0 flex-1 items-center gap-3 py-3 pl-4"
			>
				<span aria-hidden="true" class={`size-2 shrink-0 rounded-full ${DOT[props.tone]}`} />
				<span class="flex min-w-0 flex-1 flex-col gap-0.5">
					<span class="truncate text-body-lg text-fg">{props.title}</span>
					<span class="truncate text-caption text-fg-subtle">{props.line}</span>
				</span>
				<Show when={!props.action}>
					<ChevronRightIcon size="sm" class="shrink-0 text-fg-faint" />
				</Show>
			</a>
			{props.action}
		</div>
	);
}

/** A page's title with its status, a line of where and what, and its actions; phones put it in the top bar. */
export function ShipHeading(props: {
	title: string;
	badge?: JSX.Element;
	meta?: string;
	actions?: JSX.Element;
}): JSX.Element {
	return (
		<header class="hidden flex-wrap items-start justify-between gap-3 md:flex">
			<div class="flex min-w-0 flex-col gap-1.5">
				<h1 class="flex min-w-0 flex-wrap items-center gap-2.5 font-medium text-fg text-headline">
					<span class="min-w-0 break-words">{props.title}</span>
					{props.badge}
				</h1>
				<Show when={props.meta}>
					<p class="text-body text-fg-subtle">{props.meta}</p>
				</Show>
			</div>
			<Show when={props.actions}>
				<div class="flex shrink-0 flex-wrap items-center gap-2">{props.actions}</div>
			</Show>
		</header>
	);
}

/** Health at a glance: figures side by side on one card, two by two on phones. */
export function HealthStrip(props: { children: JSX.Element }): JSX.Element {
	// Two to a row on phones, a lone last figure taking the whole row; one row from lg, however
	// many figures there are, so three never leave an empty cell.
	return (
		<div class="surface-card grid grid-cols-2 overflow-hidden lg:flex [&>*]:border-line [&>*:nth-child(odd)]:border-r max-lg:[&>*:last-child:nth-child(odd)]:col-span-2 max-lg:[&>*:last-child:nth-child(odd)]:border-r-0 max-lg:[&>*:nth-child(n+3)]:border-t lg:[&>*]:flex-1 lg:[&>*]:basis-0 lg:[&>*:nth-child(n+3)]:border-t-0 lg:[&>*]:border-r lg:[&>*:last-child]:border-r-0">
			{props.children}
		</div>
	);
}

/** One figure: what it is, the number (or why there is none), and where it comes from. */
export function HealthCell(props: {
	label: string;
	value?: string;
	note: string;
	/** In place of the number. */
	empty?: JSX.Element;
	/** Beside the label, filling the cell (errors per minute). */
	chart?: JSX.Element;
}): JSX.Element {
	return (
		<div class="flex min-w-0 flex-col gap-1 p-4 md:gap-1.5 md:p-5">
			<span class="truncate text-caption text-fg-subtle">{props.label}</span>
			<Show
				when={props.chart}
				fallback={
					<Show when={props.value !== undefined} fallback={props.empty}>
						<span class="truncate text-body-lg text-fg tabular-nums md:text-headline">
							{props.value}
						</span>
					</Show>
				}
			>
				{props.chart}
			</Show>
			<span class="truncate text-caption text-fg-subtle max-md:hidden">{props.note}</span>
		</div>
	);
}

/** A tile with a glyph on the accent tint: what a highlighted card is about. */
export function ShipTile(props: { children: JSX.Element }): JSX.Element {
	return (
		<span
			aria-hidden="true"
			class="grid size-8 shrink-0 place-items-center rounded-kit tint-accent [&_img]:size-4 [&_svg]:size-4"
		>
			{props.children}
		</span>
	);
}

/**
 * The card that needs you: an accent edge, its tile, title and line, its actions on the right
 * (under it on phones), then its body.
 */
export function FocusCard(props: {
	icon: JSX.Element;
	title: string;
	meta?: string;
	badge?: JSX.Element;
	/** On the right on desktop; full width at the foot on phones. */
	actions?: JSX.Element;
	children?: JSX.Element;
	/** Under the body; its buttons share the width on phones. */
	footer?: JSX.Element;
}): JSX.Element {
	return (
		<section class="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-3 rounded-kit-lg bg-surface p-4 ring-1 ring-accent md:grid-cols-[auto_minmax(0,1fr)_auto] md:gap-y-4 md:p-5">
			<ShipTile>{props.icon}</ShipTile>
			<div class="flex min-w-0 items-start gap-3">
				<div class="flex min-w-0 flex-1 flex-col gap-0.5">
					<h2 class="truncate font-medium text-body-lg text-fg">{props.title}</h2>
					<Show when={props.meta}>
						<p class="text-caption text-fg-subtle">{props.meta}</p>
					</Show>
				</div>
				<Show when={props.badge}>{props.badge}</Show>
			</div>
			<Show when={props.actions}>
				<div class="col-span-full flex flex-wrap items-center gap-2 max-md:order-last max-md:[&>*]:flex-1 md:col-span-1">
					{props.actions}
				</div>
			</Show>
			<Show when={props.children}>
				<div class="col-span-full flex min-w-0 flex-col gap-3 md:col-start-2">{props.children}</div>
			</Show>
			<Show when={props.footer}>
				<div class="col-span-full flex flex-wrap items-center gap-x-5 gap-y-2 max-md:gap-x-2 max-md:[&>button]:flex-1 max-md:[&>a]:flex-1 md:col-start-2">
					{props.footer}
				</div>
			</Show>
		</section>
	);
}

/** A commit going out: who made it, its subject, and its short sha. */
export function CommitRow(props: {
	who: JSX.Element;
	title: string;
	by: string;
	sha: string;
}): JSX.Element {
	return (
		<div class="flex min-w-0 items-center gap-2.5 text-body">
			<span class="grid size-4 shrink-0 place-items-center [&_img]:size-3.5 [&_svg]:size-3.5">
				{props.who}
			</span>
			<span class="min-w-0 flex-1 truncate text-fg">{props.title}</span>
			<span class="shrink-0 text-caption text-fg-subtle max-sm:hidden">{props.by}</span>
			<span class="shrink-0 font-mono text-caption text-fg-subtle">{props.sha.slice(0, 7)}</span>
		</div>
	);
}

/** A tick (or a cross) and what it vouches for. */
export function CheckNote(props: { ok?: boolean; children: JSX.Element }): JSX.Element {
	return (
		<span
			class={`inline-flex items-center gap-1.5 text-caption ${props.ok === false ? "text-danger" : "text-fg-muted"}`}
		>
			<Show when={props.ok !== false} fallback={<CloseIcon size="sm" class="size-3.5" />}>
				<CheckIcon size="sm" class="size-3.5 text-success" />
			</Show>
			{props.children}
		</span>
	);
}

/** A section's title with a quiet note on its right (Deploy history · Vercel). */
export function ShipSectionTitle(props: { children: JSX.Element; note?: string }): JSX.Element {
	return (
		<div class="flex items-baseline justify-between gap-3 pt-1">
			<h2 class="font-medium text-body-lg text-fg">{props.children}</h2>
			<Show when={props.note}>
				<span class="text-caption text-fg-subtle">{props.note}</span>
			</Show>
		</div>
	);
}

/** Rows on one card, divided by hairlines. */
export function ShipRows(props: { children: JSX.Element }): JSX.Element {
	return (
		<div class="surface-card flex flex-col divide-y divide-line overflow-hidden">
			{props.children}
		</div>
	);
}

/**
 * One deploy: its version, what it shipped and who, and its state or what can be done with it.
 * Phones put the version before the title.
 */
export function DeployRow(props: {
	version: string;
	title: string;
	meta: JSX.Element;
	status?: JSX.Element;
	action?: JSX.Element;
}): JSX.Element {
	return (
		<div class="flex min-w-0 items-center gap-3 px-4 py-3 md:gap-4 md:px-5">
			<span class="w-20 shrink-0 truncate font-mono text-caption text-fg max-md:hidden">
				{props.version}
			</span>
			<span class="flex min-w-0 flex-1 flex-col gap-0.5">
				<span class="truncate text-body text-fg">
					<span class="md:hidden">{`${props.version} · `}</span>
					{props.title}
				</span>
				<span class="flex min-w-0 items-center gap-1.5 truncate text-caption text-fg-subtle [&_img]:size-3 [&_svg]:size-3">
					{props.meta}
				</span>
			</span>
			<Show when={props.status}>{props.status}</Show>
			<Show when={props.action}>{props.action}</Show>
		</div>
	);
}

export type CheckState = "success" | "failure" | "pending" | "skipped" | "neutral";

/** A check's mark: a green tick, a red cross, a ring while it runs, empty when skipped. */
export function CheckMark(props: { state: CheckState }): JSX.Element {
	return (
		<span aria-hidden="true" class="grid size-5 shrink-0 place-items-center">
			<Show
				when={props.state === "success" || props.state === "neutral"}
				fallback={
					<Show
						when={props.state === "failure"}
						fallback={
							<span
								class={`size-4.5 rounded-full ring-1 ${props.state === "pending" ? "animate-pulse bg-accent/15 ring-accent" : "ring-line-strong"}`}
							/>
						}
					>
						<span class="grid size-4.5 place-items-center rounded-full bg-danger text-white [&_svg]:size-3">
							<CloseIcon />
						</span>
					</Show>
				}
			>
				<span class="grid size-4.5 place-items-center rounded-full bg-success text-white [&_svg]:size-3">
					<CheckIcon />
				</span>
			</Show>
		</span>
	);
}

/** One check in a pipeline: its mark, name, and how long it took or why it did not run. */
export function CheckRunRow(props: {
	state: CheckState;
	name: string;
	note: string;
	action?: JSX.Element;
}): JSX.Element {
	return (
		<div class="flex min-h-11 min-w-0 items-center gap-3 px-4 py-2 md:px-5">
			<CheckMark state={props.state} />
			<span class="sr-only">
				{props.state === "success"
					? "Passed:"
					: props.state === "failure"
						? "Failed:"
						: props.state === "pending"
							? "Running:"
							: "Skipped:"}
			</span>
			<span class="min-w-0 flex-1 truncate text-body text-fg">{props.name}</span>
			<span class="shrink-0 truncate text-caption text-fg-subtle tabular-nums">{props.note}</span>
			<Show when={props.action}>{props.action}</Show>
		</div>
	);
}

/** Why a check failed: the log's lines, failures in red and stack frames faint. */
export function LogExcerpt(props: { text: string }): JSX.Element {
	const tone = (line: string) =>
		/\b(FAIL|FAILED|ERROR|Error|error)\b|✗|✘|×/.test(line)
			? "text-danger"
			: /^\s*at\s/.test(line)
				? "text-fg-faint"
				: "text-fg";
	return (
		<pre class="surface-well overflow-x-auto px-4 py-3.5 font-mono text-caption leading-5 md:px-5">
			<For each={props.text.split("\n")}>
				{(line) => <div class={tone(line)}>{line || " "}</div>}
			</For>
		</pre>
	);
}

/** A gate before a promotion: passed, failed or waiting, and what it checked. */
export function GateRow(props: {
	/** Skipped draws an empty ring: noted, not checked. */
	state: CheckState;
	title: string;
	detail?: string;
}): JSX.Element {
	return (
		<div class="flex min-w-0 items-center gap-3 px-4 py-3">
			<CheckMark state={props.state} />
			<span class="flex min-w-0 flex-1 flex-col gap-0.5">
				<span class="truncate text-body text-fg">{props.title}</span>
				<Show when={props.detail}>
					<span class="truncate text-caption text-fg-subtle">{props.detail}</span>
				</Show>
			</span>
		</div>
	);
}

/** A setting on the fill with its control on the right (Watch for 15 minutes after). */
export function OptionStrip(props: {
	icon: JSX.Element;
	title: string;
	detail: string;
	control: JSX.Element;
}): JSX.Element {
	return (
		<div class="flex min-w-0 items-center gap-3 rounded-kit-lg bg-fill px-4 py-3">
			<span aria-hidden="true" class="shrink-0 text-fg-subtle [&_svg]:size-4">
				{props.icon}
			</span>
			<span class="flex min-w-0 flex-1 flex-col gap-0.5">
				<span class="text-body text-fg">{props.title}</span>
				<span class="text-caption text-fg-subtle">{props.detail}</span>
			</span>
			{props.control}
		</div>
	);
}

/** Previews as cards, two across on desktop. */
export function PreviewGrid(props: { children: JSX.Element }): JSX.Element {
	return <div class="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">{props.children}</div>;
}

/**
 * A pull request's preview: a sketch of its page (the bar in its state's colour), its title and
 * address, its state, and what to do with it.
 */
export function PreviewCard(props: {
	title: string;
	url?: string;
	badge: JSX.Element;
	note: string;
	tone: "accent" | "warning" | "danger" | "neutral";
	actions?: JSX.Element;
}): JSX.Element {
	const bar = {
		accent: "bg-accent",
		warning: "bg-warning",
		danger: "bg-danger",
		neutral: "bg-fg-faint",
	}[props.tone];
	return (
		<article class="surface-card flex min-w-0 flex-col overflow-hidden">
			<div aria-hidden="true" class="grid h-40 place-items-center bg-fill px-10 md:h-44">
				<div class="flex w-full max-w-sm flex-col gap-2 rounded-kit bg-surface p-3 ring-line">
					<span class="h-1 w-1/2 rounded-full bg-fg" />
					<span class="h-0.5 w-3/4 rounded-full bg-fill-strong" />
					<span class="h-0.5 w-2/3 rounded-full bg-fill-strong" />
					<span class={`mt-6 ml-auto h-2 w-1/4 rounded-full ${bar}`} />
				</div>
			</div>
			<div class="flex min-w-0 flex-col gap-3 p-4">
				<div class="flex min-w-0 items-start gap-3">
					<div class="flex min-w-0 flex-1 flex-col gap-0.5">
						<h3 class="truncate text-body text-fg">{props.title}</h3>
						<Show when={props.url}>
							<span class="truncate font-mono text-caption text-fg-subtle">{props.url}</span>
						</Show>
					</div>
					{props.badge}
				</div>
				<div class="flex min-w-0 items-center gap-2">
					<span class="min-w-0 flex-1 truncate text-caption text-fg-subtle">{props.note}</span>
					{props.actions}
				</div>
			</div>
		</article>
	);
}
