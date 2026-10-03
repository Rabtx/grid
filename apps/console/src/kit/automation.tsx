import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";

import { ToneTile, type FeedTone } from "./feed";
import {
	AlertIcon,
	BoltIcon,
	BranchIcon,
	CalendarIcon,
	CheckIcon,
	ChevronRightIcon,
	ClockIcon,
	CloseIcon,
	CodeIcon,
	EditIcon,
	EyeIcon,
	ListIcon,
	PullRequestIcon,
	SearchIcon,
	ShieldIcon,
	TerminalIcon,
	ToolIcon,
} from "./icons";

/* ------------------------------------------------------------------------------------------
 * Figma 20 · Automations. The list in the panel (Active, Paused), an automation as a recipe read
 * as a sentence with its guardrails and runs, its last run step by step, and the strip of its
 * recent runs; on phones, what runs next and each automation's last few runs.
 * ---------------------------------------------------------------------------------------- */

/** The glyphs an automation can wear, each on its own tint. */
export const AUTOMATION_GLYPHS = [
	{ id: "code", label: "Code", tone: "accent", icon: () => <CodeIcon /> },
	{ id: "eye", label: "Review", tone: "violet", icon: () => <EyeIcon /> },
	{ id: "bug", label: "Triage", tone: "warning", icon: () => <ToolIcon /> },
	{ id: "layers", label: "Dependencies", tone: "success", icon: () => <ListIcon /> },
	{ id: "file-edit", label: "Docs", tone: "success", icon: () => <EditIcon /> },
	{ id: "calendar", label: "Digest", tone: "accent", icon: () => <CalendarIcon /> },
	{ id: "shield", label: "Security", tone: "danger", icon: () => <ShieldIcon /> },
	{ id: "pull", label: "Pull requests", tone: "violet", icon: () => <PullRequestIcon /> },
	{ id: "bolt", label: "Anything", tone: "accent", icon: () => <BoltIcon /> },
] as const satisfies readonly {
	id: string;
	label: string;
	tone: FeedTone;
	icon: () => JSX.Element;
}[];

export type AutomationGlyphName = (typeof AUTOMATION_GLYPHS)[number]["id"];

/** An automation's glyph on its tint; grey while it is paused. */
export function AutomationGlyph(props: {
	icon: string | null | undefined;
	paused?: boolean;
	size?: "md" | "lg";
}): JSX.Element {
	const glyph = () =>
		AUTOMATION_GLYPHS.find((item) => item.id === props.icon) ?? AUTOMATION_GLYPHS[0];
	return (
		<ToneTile tone={props.paused ? "neutral" : glyph().tone} size={props.size}>
			{glyph().icon()}
		</ToneTile>
	);
}

/** A caption over a group in the panel or the phone's list, with a note on its right. */
export function AutomationGroupLabel(props: {
	children: JSX.Element;
	note?: string;
	phone?: boolean;
}): JSX.Element {
	return (
		<h3
			class={`flex items-center justify-between gap-2 font-normal text-caption text-fg-subtle ${props.phone ? "px-0 pt-5 pb-1" : "px-2 pt-2 pb-1"}`}
		>
			<span>{props.children}</span>
			<Show when={props.note}>
				<span>{props.note}</span>
			</Show>
		</h3>
	);
}

/**
 * An automation in the panel: its glyph, name and when (Tonight, 12 today, Paused), then the agent
 * that runs it and how it starts. Paused ones sit back.
 */
export function AutomationPanelRow(props: {
	href: string;
	title: string;
	time: string;
	line: string;
	glyph: string | null;
	who?: JSX.Element;
	paused?: boolean;
	current?: boolean;
}): JSX.Element {
	return (
		<a
			href={props.href}
			aria-current={props.current ? "page" : undefined}
			class="focus-ring flex min-w-0 items-center gap-2.5 rounded-kit-md p-2 transition-colors duration-fast hover:bg-fill aria-[current=page]:bg-fill-strong"
		>
			<AutomationGlyph icon={props.glyph} paused={props.paused} />
			<span class="flex min-w-0 flex-1 flex-col gap-0.5">
				<span class="flex min-w-0 items-center gap-1.5">
					<span
						class={`min-w-0 flex-1 truncate font-medium text-body ${props.paused ? "text-fg-subtle" : "text-fg"}`}
					>
						{props.title}
					</span>
					<span class="shrink-0 text-caption text-fg-subtle tabular-nums">{props.time}</span>
				</span>
				<span class="flex min-w-0 items-center gap-1.5 text-caption text-fg-subtle [&_img]:size-3 [&_svg]:size-3">
					{props.who}
					<span class="truncate">{props.line}</span>
				</span>
			</span>
		</a>
	);
}

/**
 * The opened automation: its heading and column with the last run beside them on desktop; on
 * phones the heading, then the last run, then the rest.
 */
export function AutomationLayout(props: {
	heading: JSX.Element;
	main: JSX.Element;
	aside: JSX.Element;
}): JSX.Element {
	return (
		<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
			<div class="mx-auto grid w-full max-w-280 grid-cols-1 gap-4 px-4 pt-2 pb-28 md:grid-cols-[minmax(0,1fr)_23.75rem] md:items-start md:gap-x-6 md:px-8 md:pt-8 md:pb-10 lg:px-12">
				<div class="min-w-0 md:col-start-1 md:row-start-1">{props.heading}</div>
				<aside class="flex min-w-0 flex-col md:col-start-2 md:row-span-2 md:row-start-1">
					{props.aside}
				</aside>
				<div class="flex min-w-0 flex-col gap-4 md:col-start-1 md:row-start-2">{props.main}</div>
			</div>
		</div>
	);
}

/**
 * The opened automation's heading: its glyph, name, and when it runs next and who made it; phones
 * say who runs it and when instead, since their top bar already says when it runs next.
 */
export function AutomationHeading(props: {
	glyph: string | null;
	paused?: boolean;
	title: string;
	meta: JSX.Element;
	phoneMeta?: JSX.Element;
}): JSX.Element {
	const line =
		"min-w-0 flex-wrap items-center gap-x-1.5 text-caption text-fg-subtle md:text-body [&_img]:size-3 [&_svg]:size-3";
	return (
		<header class="flex min-w-0 items-center gap-3 md:gap-3.5">
			<AutomationGlyph icon={props.glyph} paused={props.paused} size="lg" />
			<div class="flex min-w-0 flex-col">
				<h1 class="truncate font-medium text-body-lg text-fg md:text-title">{props.title}</h1>
				<p class={`flex ${props.phoneMeta ? "max-md:hidden" : ""} ${line}`}>{props.meta}</p>
				<Show when={props.phoneMeta}>
					<p class={`flex md:hidden ${line}`}>{props.phoneMeta}</p>
				</Show>
			</div>
		</header>
	);
}

/** A card with a quiet caption and a note on its right (Recipe, Edited 3d ago). */
export function AutomationCard(props: {
	label: string;
	note?: JSX.Element;
	badge?: JSX.Element;
	children: JSX.Element;
}): JSX.Element {
	return (
		<section aria-label={props.label} class="surface-card flex min-w-0 flex-col gap-3 p-4 md:p-6">
			<div class="flex min-w-0 items-start justify-between gap-3">
				<div class="flex min-w-0 flex-col">
					<h2 class="font-normal text-caption text-fg-subtle">{props.label}</h2>
				</div>
				<Show when={props.note}>
					<span class="shrink-0 text-caption text-fg-subtle">{props.note}</span>
				</Show>
				{props.badge}
			</div>
			{props.children}
		</section>
	);
}

/** The recipe as a sentence: words, and tokens for what each part is set to. */
export function Recipe(props: { children: JSX.Element }): JSX.Element {
	return (
		<p class="flex flex-wrap items-center gap-x-2 gap-y-2 text-body text-fg-muted md:text-body-lg">
			{props.children}
		</p>
	);
}

/** One part of the recipe: what it is set to, with its glyph. */
export function RecipeToken(props: {
	icon?: JSX.Element;
	tone?: "accent" | "violet" | "muted";
	children: JSX.Element;
}): JSX.Element {
	const tint = () =>
		props.tone === "accent"
			? "[&_svg]:text-accent"
			: props.tone === "violet"
				? "[&_svg]:text-violet"
				: "[&_svg]:text-fg-subtle";
	return (
		<span
			class={`inline-flex h-kit-control min-w-0 max-w-full items-center gap-1.5 rounded-kit bg-fill px-2.5 text-body text-fg [&_img]:size-3.5 [&_svg]:size-3.5 ${tint()}`}
		>
			{props.icon}
			<span class="truncate">{props.children}</span>
		</span>
	);
}

/** What the agent is asked, boxed in the recipe, with a quiet line under it. */
export function RecipePrompt(props: { text: string; meta?: JSX.Element }): JSX.Element {
	return (
		<div class="flex min-w-0 flex-col gap-2 rounded-kit-lg bg-fill p-3.5 md:p-4">
			<p class="whitespace-pre-wrap text-body text-fg md:text-body-lg">{props.text}</p>
			<Show when={props.meta}>
				<p class="text-caption text-fg-subtle">{props.meta}</p>
			</Show>
		</div>
	);
}

/** The guardrails, side by side on desktop. */
export function Guardrails(props: { children: JSX.Element }): JSX.Element {
	return <div class="grid grid-cols-1 gap-2 sm:grid-cols-3 md:gap-3">{props.children}</div>;
}

/** One guardrail: Time limit, Budget, Off-limits, and what it is set to. */
export function GuardrailCard(props: {
	icon: JSX.Element;
	label: string;
	value: string;
	unset?: boolean;
}): JSX.Element {
	return (
		<div class="surface-card flex min-w-0 flex-col gap-1.5 px-4 py-3">
			<span class="flex items-center gap-1.5 text-caption text-fg-subtle [&_svg]:size-3.5">
				{props.icon}
				{props.label}
			</span>
			<span class={`truncate text-body ${props.unset ? "text-fg-subtle" : "text-fg"}`}>
				{props.value}
			</span>
		</div>
	);
}

/** How a run came out, as its mark and colour. */
export type RunMark = "passed" | "pr" | "failed" | "running" | "skipped" | "empty";

const MARK_TINT: Record<RunMark, string> = {
	passed: "tint-success",
	pr: "tint-violet",
	failed: "tint-danger",
	running: "tint-accent",
	skipped: "bg-fill-strong text-fg-subtle",
	empty: "bg-fill-strong text-fg-subtle",
};

/** A run's mark: ticked, a pull request, crossed, or a clock while it runs. */
export function RunMarkGlyph(props: { mark: RunMark }): JSX.Element {
	return (
		<span
			aria-hidden="true"
			class={`grid size-5 shrink-0 place-items-center rounded-kit-sm [&_svg]:size-3 ${MARK_TINT[props.mark]}`}
		>
			{props.mark === "passed" ? (
				<CheckIcon />
			) : props.mark === "pr" ? (
				<PullRequestIcon />
			) : props.mark === "failed" ? (
				<CloseIcon />
			) : (
				<ClockIcon />
			)}
		</span>
	);
}

/** The runs, as a table: when, what came of it, how long. */
export function RunsTable(props: { children: JSX.Element }): JSX.Element {
	return (
		<section aria-label="Runs" class="surface-card flex min-w-0 flex-col overflow-hidden">
			<div class="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)_4.5rem_1rem] items-center gap-3 border-line border-b px-4 py-2.5 text-caption text-fg-subtle max-sm:hidden">
				<span>Run</span>
				<span>Result</span>
				<span>Duration</span>
				<span />
			</div>
			<div class="flex flex-col divide-y divide-line">{props.children}</div>
		</section>
	);
}

/** One run in the table; it opens the thread it made. */
export function RunTableRow(props: {
	mark: RunMark;
	when: string;
	result: string;
	failed?: boolean;
	duration: string;
	onOpen?: () => void;
}): JSX.Element {
	return (
		<button
			type="button"
			disabled={!props.onOpen}
			onClick={() => props.onOpen?.()}
			class="focus-ring grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-4 py-2.5 text-left text-body transition-colors duration-fast enabled:hover:bg-fill sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)_4.5rem_1rem]"
		>
			<span class="flex min-w-0 items-center gap-2.5 max-sm:row-span-2">
				<RunMarkGlyph mark={props.mark} />
				<span class="truncate text-fg max-sm:hidden">{props.when}</span>
			</span>
			<span class="truncate text-fg sm:hidden">{props.when}</span>
			<span class={`truncate ${props.failed ? "text-danger" : "text-fg-muted"}`}>
				{props.result}
			</span>
			<span class="text-fg-subtle tabular-nums max-sm:hidden">{props.duration}</span>
			<span class="text-fg-subtle max-sm:col-start-3 max-sm:row-span-2 max-sm:row-start-1 [&_svg]:size-3.5">
				<ChevronRightIcon />
			</span>
		</button>
	);
}

/** What a step of a run did, guessed from its title, as the glyph it wears. */
export type StepKind = "branch" | "terminal" | "search" | "code" | "pull" | "failed";

const STEP_ICON: Record<StepKind, () => JSX.Element> = {
	branch: () => <BranchIcon />,
	terminal: () => <TerminalIcon />,
	search: () => <SearchIcon />,
	code: () => <CodeIcon />,
	pull: () => <PullRequestIcon />,
	failed: () => <AlertIcon />,
};

/** The last run, step by step (Figma Last run), with how it stands on its right. */
export function LastRunCard(props: {
	title: string;
	meta: string;
	badge?: JSX.Element;
	children: JSX.Element;
	footer?: JSX.Element;
}): JSX.Element {
	return (
		<section aria-label={props.title} class="surface-card flex min-w-0 flex-col p-4">
			<div class="flex min-w-0 items-start justify-between gap-3 pb-3">
				<div class="flex min-w-0 flex-col">
					<h2 class="font-medium text-body-lg text-fg">{props.title}</h2>
					<span class="text-caption text-fg-subtle">{props.meta}</span>
				</div>
				{props.badge}
			</div>
			<ol class="flex flex-col">{props.children}</ol>
			<Show when={props.footer}>
				<div class="mt-3 border-line border-t pt-3">{props.footer}</div>
			</Show>
		</section>
	);
}

/** "Needs review": a run that opened a pull request and is waiting on you. */
export function NeedsReviewBadge(props: { children: JSX.Element }): JSX.Element {
	return (
		<span class="inline-flex h-5 shrink-0 items-center gap-1 rounded-kit-sm px-1.5 text-caption tint-violet">
			<span class="size-1.5 rounded-full bg-current" />
			{props.children}
		</span>
	);
}

/** One step of the last run, joined to the next by a line. */
export function RunStepRow(props: {
	kind: StepKind;
	title: string;
	detail?: JSX.Element;
	action?: JSX.Element;
}): JSX.Element {
	const tint = () =>
		props.kind === "failed"
			? "tint-danger"
			: props.kind === "pull"
				? "tint-violet"
				: "tint-success";
	return (
		<li class="group/step relative flex min-w-0 items-start gap-3 pb-3 last:pb-0">
			<span
				aria-hidden="true"
				class="absolute top-6 bottom-0 left-2.5 w-px bg-line group-last/step:hidden"
			/>
			<span
				aria-hidden="true"
				class={`relative grid size-5 shrink-0 place-items-center rounded-kit-sm [&_svg]:size-3 ${tint()}`}
			>
				{STEP_ICON[props.kind]()}
			</span>
			<span class="flex min-w-0 flex-1 flex-col">
				<span class="truncate text-body text-fg">{props.title}</span>
				<Show when={props.detail}>
					<span class="truncate text-caption text-fg-subtle">{props.detail}</span>
				</Show>
			</span>
			<Show when={props.action}>
				<span class="shrink-0">{props.action}</span>
			</Show>
		</li>
	);
}

const DOT: Record<RunMark, string> = {
	passed: "bg-success",
	pr: "bg-violet",
	failed: "bg-danger",
	running: "bg-accent",
	skipped: "bg-fill-strong",
	empty: "bg-fill-strong",
};

/** The last runs as a strip of dots, oldest first, with its legend under it. */
export function RunDots(props: {
	label: string;
	note?: string;
	marks: readonly RunMark[];
}): JSX.Element {
	return (
		<div class="flex min-w-0 flex-col gap-2">
			<div class="flex items-center justify-between gap-2 text-caption">
				<span class="text-fg-muted">{props.label}</span>
				<Show when={props.note}>
					<span class="text-fg-subtle">{props.note}</span>
				</Show>
			</div>
			<ol aria-label={props.label} class="flex flex-wrap gap-1">
				<For each={props.marks}>
					{(mark) => <li class={`size-2 rounded-full ${DOT[mark]}`} title={mark} />}
				</For>
			</ol>
			<ul class="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-fg-subtle">
				<For
					each={
						[
							["passed", "Passed"],
							["pr", "Opened PR"],
							["failed", "Failed"],
						] as const
					}
				>
					{([mark, label]) => (
						<li class="flex items-center gap-1.5">
							<span class={`size-2 rounded-kit-xs ${DOT[mark]}`} />
							{label}
						</li>
					)}
				</For>
			</ul>
		</div>
	);
}

/** An automation's last few runs as small bars, on the phone's list. */
export function RunBars(props: { marks: readonly RunMark[]; label: string }): JSX.Element {
	return (
		<ol aria-label={props.label} class="flex shrink-0 items-center gap-0.5">
			<For each={props.marks}>
				{(mark) => <li title={mark} class={`h-3.5 w-1.5 rounded-kit-xs ${DOT[mark]}`} />}
			</For>
		</ol>
	);
}

/** What runs next, on the phone (Figma Up next). */
export function UpNextCard(props: { note?: string; children: JSX.Element }): JSX.Element {
	return (
		<section aria-label="Up next" class="surface-card flex min-w-0 flex-col gap-3 p-4">
			<div class="flex items-center justify-between gap-2 text-caption text-fg-subtle [&_svg]:size-3.5">
				<span class="flex items-center gap-1.5">
					<CalendarIcon />
					Up next
				</span>
				<Show when={props.note}>
					<span>{props.note}</span>
				</Show>
			</div>
			<ol class="flex flex-col gap-3">{props.children}</ol>
		</section>
	);
}

/** One automation up next: when, a bar in its tint, its name and who runs it. */
export function UpNextRow(props: {
	day?: string;
	time: string;
	title: string;
	line: string;
	who?: JSX.Element;
	glyph: string | null;
	href: string;
}): JSX.Element {
	const tone = () =>
		AUTOMATION_GLYPHS.find((item) => item.id === props.glyph)?.tone ?? AUTOMATION_GLYPHS[0].tone;
	return (
		<li>
			<a
				href={props.href}
				aria-label={`${props.title}, ${props.day ? `${props.day} ` : ""}${props.time}`}
				class="focus-ring flex min-w-0 items-stretch gap-3 rounded-kit"
			>
				<span class="flex w-14 shrink-0 flex-col justify-center text-body text-fg tabular-nums">
					<Show when={props.day}>
						<span>{props.day}</span>
					</Show>
					<span>{props.time}</span>
				</span>
				<span class={`w-0.5 shrink-0 rounded-full ${DOT_TONE[tone()]}`} />
				<span class="flex min-w-0 flex-1 flex-col justify-center">
					<span class="truncate text-body text-fg">{props.title}</span>
					<span class="flex min-w-0 items-center gap-1.5 text-caption text-fg-subtle [&_img]:size-3 [&_svg]:size-3">
						{props.who}
						<span class="truncate">{props.line}</span>
					</span>
				</span>
			</a>
		</li>
	);
}

const DOT_TONE: Record<FeedTone, string> = {
	neutral: "bg-fg-faint",
	accent: "bg-accent",
	violet: "bg-violet",
	success: "bg-success",
	warning: "bg-warning",
	danger: "bg-danger",
};

/** An automation on the phone's list: glyph, name, who and when, and its last runs. */
export function AutomationListRow(props: {
	href: string;
	title: string;
	line: string;
	glyph: string | null;
	who?: JSX.Element;
	paused?: boolean;
	trailing?: JSX.Element;
}): JSX.Element {
	return (
		<a
			href={props.href}
			class={`focus-ring flex min-h-15 min-w-0 items-center gap-3 border-line border-b py-2.5 last:border-b-0 ${props.paused ? "opacity-60" : ""}`}
		>
			<AutomationGlyph icon={props.glyph} paused={props.paused} size="lg" />
			<span class="flex min-w-0 flex-1 flex-col gap-0.5">
				<span class="truncate text-body-lg text-fg">{props.title}</span>
				<span class="flex min-w-0 items-center gap-1.5 text-caption text-fg-subtle [&_img]:size-3 [&_svg]:size-3">
					{props.who}
					<span class="truncate">{props.line}</span>
				</span>
			</span>
			{props.trailing}
		</a>
	);
}

/** A template to start from: its glyph, name and what it does, and its add button. */
export function TemplateRow(props: {
	title: string;
	description: string;
	glyph: string | null;
	action: JSX.Element;
}): JSX.Element {
	return (
		<div class="flex min-h-15 min-w-0 items-center gap-3 py-2">
			<AutomationGlyph icon={props.glyph} size="lg" />
			<span class="flex min-w-0 flex-1 flex-col gap-0.5">
				<span class="truncate text-body-lg text-fg md:text-body">{props.title}</span>
				<span class="truncate text-caption text-fg-subtle">{props.description}</span>
			</span>
			<span class="shrink-0">{props.action}</span>
		</div>
	);
}

/** The phone's bar under an opened automation: Active, then edit and Run now. */
export function AutomationActionBar(props: { children: JSX.Element }): JSX.Element {
	return (
		<div class="fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 border-line border-t bg-surface px-4 pt-3 pb-safe md:hidden">
			{props.children}
		</div>
	);
}
