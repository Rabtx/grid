import type { JSX } from "@solidjs/web";
import { createMemo, createSignal, For, Show } from "solid-js";

import { Shimmer } from "./feedback";
import { AlertIcon, CheckIcon, ChevronDownIcon, SpinnerIcon } from "./icons";

export type StepStatus = "running" | "done" | "error" | "waiting";

export type RunStep = {
	id: string;
	icon: JSX.Element;
	label: string;
	/** A tag on the right: the tool, the file type. */
	meta?: string;
	status?: StepStatus;
	/** Shown when the step is opened: output, a diff, JSON. */
	detail?: JSX.Element;
};

/**
 * What an agent did, as a quiet timeline: a summary line that folds the steps, then one row per
 * step with its icon joined by a thread, each opening to its output.
 */
export function RunSteps(props: {
	summary: string;
	elapsed?: string;
	steps: readonly RunStep[];
	defaultOpen?: boolean;
}): JSX.Element {
	const [open, setOpen] = createSignal(props.defaultOpen ?? true);
	return (
		<div class="flex flex-col">
			<button
				type="button"
				aria-expanded={open() ? "true" : "false"}
				onClick={() => setOpen(!open())}
				class="focus-ring group/sum flex h-8 items-center gap-2 rounded-kit text-body text-fg-muted hover:text-fg"
			>
				<span class="min-w-0 truncate">{props.summary}</span>
				<ChevronDownIcon
					class={`size-3.5 shrink-0 text-fg-faint transition-transform duration-fast ${open() ? "" : "-rotate-90"}`}
				/>
				<Show when={props.elapsed}>
					<span class="ml-auto shrink-0 text-caption text-fg-faint tabular-nums">
						{props.elapsed}
					</span>
				</Show>
			</button>
			<Show when={open()}>
				<ol class="relative flex flex-col">
					<For each={props.steps}>
						{(step, index) => <StepRow step={step} last={index() === props.steps.length - 1} />}
					</For>
				</ol>
			</Show>
		</div>
	);
}

function StepRow(props: { step: RunStep; last: boolean }): JSX.Element {
	const [open, setOpen] = createSignal(false);
	const tone = () =>
		props.step.status === "error"
			? "text-danger"
			: props.step.status === "waiting"
				? "text-warning"
				: "text-fg-subtle";
	return (
		<li class="relative flex flex-col pl-7">
			<Show when={!props.last}>
				<span aria-hidden="true" class="absolute top-6 bottom-0 left-[9px] w-px bg-line" />
			</Show>
			<span class={`absolute top-1.5 left-0.5 grid size-4 place-items-center ${tone()}`}>
				<Show when={props.step.status === "running"} fallback={props.step.icon}>
					<SpinnerIcon class="size-3.5 animate-spin" />
				</Show>
			</span>
			<button
				type="button"
				disabled={!props.step.detail}
				aria-expanded={props.step.detail ? (open() ? "true" : "false") : undefined}
				onClick={() => setOpen(!open())}
				class="focus-ring flex min-h-7 w-full items-center gap-2 rounded-kit text-left text-body text-fg-muted enabled:hover:text-fg"
			>
				<span
					class={`min-w-0 flex-1 truncate ${props.step.status === "error" ? "text-danger" : ""}`}
				>
					{props.step.label}
				</span>
				<Show when={props.step.meta}>
					<span class="shrink-0 rounded-kit-sm bg-fill-strong px-1.5 font-kit text-caption text-fg-subtle">
						{props.step.meta}
					</span>
				</Show>
			</button>
			<Show when={open() && props.step.detail}>
				<div class="mt-1 mb-2">{props.step.detail}</div>
			</Show>
		</li>
	);
}

/** One line on how a run stands: working (with time), needs a fix, needs input, done. */
export function RunStatus(props: { status: StepStatus; children: JSX.Element }): JSX.Element {
	const look = {
		running: { class: "text-fg-subtle", icon: <SpinnerIcon class="size-4 animate-spin" /> },
		done: { class: "text-fg-subtle", icon: <CheckIcon class="size-4 text-success" /> },
		error: { class: "text-danger", icon: <AlertIcon class="size-4" /> },
		waiting: { class: "text-warning", icon: <AlertIcon class="size-4" /> },
	}[props.status];
	return (
		<p class={`flex items-center gap-2 px-1 text-body-lg ${look.class}`}>
			{look.icon}
			{props.children}
		</p>
	);
}

/** A block of code or output with its language and a copy button. */
export function CodeBlock(props: { label: string; code: string }): JSX.Element {
	const [copied, setCopied] = createSignal(false);
	return (
		<div class="overflow-hidden rounded-kit-lg bg-fill ring-line">
			<div class="flex h-8 items-center justify-between pr-1 pl-3">
				<span class="text-caption text-fg-subtle">{props.label}</span>
				<button
					type="button"
					onClick={() => {
						void navigator.clipboard?.writeText(props.code);
						setCopied(true);
						setTimeout(() => setCopied(false), 1200);
					}}
					class="focus-ring h-6 rounded-kit-sm px-2 text-caption text-fg-subtle hover:bg-fill-strong hover:text-fg"
				>
					{copied() ? "Copied" : "Copy"}
				</button>
			</div>
			<pre class="overflow-x-auto px-3 pb-3 font-mono text-caption text-fg-muted leading-5">
				{props.code}
			</pre>
		</div>
	);
}

/**
 * A file to read: its lines numbered in a gutter, long lines scrolling sideways, the text
 * selectable without the numbers. For files the console shows rather than edits.
 */
export function CodeView(props: { text: string }): JSX.Element {
	const lines = createMemo(() => {
		const count = props.text.split("\n").length - (props.text.endsWith("\n") ? 1 : 0);
		return Array.from({ length: Math.max(count, 1) }, (_, index) => index + 1).join("\n");
	});
	return (
		<div class="flex min-w-0 font-mono text-caption leading-5">
			<pre
				aria-hidden="true"
				class="shrink-0 select-none border-line border-r px-3 py-3 text-right text-fg-faint tabular-nums"
			>
				{lines()}
			</pre>
			<pre class="min-w-0 flex-1 overflow-x-auto px-4 py-3 text-fg-muted" style={{ "tab-size": 4 }}>
				{props.text}
			</pre>
		</div>
	);
}

/**
 * Something that folds open: a quiet summary line, then its content. Native `<details>`, so it
 * keeps its state while a run appends above and below it.
 */
export function Disclosure(props: {
	summary: JSX.Element;
	/** The summary's leading glyph: an icon, a spinner, a warning. */
	icon?: JSX.Element;
	/** On the far right of the summary: how long it took, a count. */
	trailing?: JSX.Element;
	/** A chevron after the summary that turns as it opens, for a line that plainly unfolds. */
	chevron?: boolean;
	children: JSX.Element;
	open?: boolean;
}): JSX.Element {
	return (
		<details class="group/disclosure" open={props.open}>
			<summary class="flex min-h-7 cursor-pointer list-none items-center gap-2 px-1 py-1 text-body-lg text-fg-subtle transition-colors duration-fast hover:text-fg-muted pointer-coarse:min-h-10 [&::-webkit-details-marker]:hidden">
				<Show when={props.icon}>
					<span class="grid size-4 shrink-0 place-items-center">{props.icon}</span>
				</Show>
				<span class="flex min-w-0 items-center gap-1.5">{props.summary}</span>
				<Show when={props.chevron}>
					<ChevronDownIcon
						size="xs"
						class="shrink-0 text-fg-faint transition-transform duration-fast group-open/disclosure:rotate-180"
					/>
				</Show>
				<span class="flex-1" />
				<Show when={props.trailing}>
					<span class="shrink-0 text-body text-fg-faint tabular-nums">{props.trailing}</span>
				</Show>
			</summary>
			{props.children}
		</details>
	);
}

/**
 * The line that opens an agent's turn: how long it has been working (shimmering while it goes)
 * or how long it took, over a hairline.
 */
export function TurnHeader(props: { children: JSX.Element; live?: boolean }): JSX.Element {
	return (
		<p class="border-line border-b px-1 pb-2.5 text-body-lg text-fg-subtle tabular-nums">
			<Shimmer active={Boolean(props.live)}>{props.children}</Shimmer>
		</p>
	);
}

/**
 * Something that went wrong in a run, as a soft card: what happened, then what can be done
 * about it. Put under a `RunStatus` that names it ("Needs a fix").
 */
export function NoticeCard(props: {
	title: string;
	children?: JSX.Element;
	actions?: JSX.Element;
}): JSX.Element {
	return (
		<div class="surface-well flex flex-col gap-1 px-4 py-3.5">
			<p class="text-body text-fg-subtle">{props.title}</p>
			<Show when={props.children}>
				<div class="whitespace-pre-wrap break-words text-body-lg text-fg">{props.children}</div>
			</Show>
			<Show when={props.actions}>
				<div class="mt-2 flex flex-wrap gap-2">{props.actions}</div>
			</Show>
		</div>
	);
}

/** Steps listed down a thin guide line, under the thing that holds them. */
export function Rail(props: { children: JSX.Element }): JSX.Element {
	return (
		<ul class="mt-0.5 mb-1 ml-3 flex flex-col border-line border-l pl-3.5">{props.children}</ul>
	);
}

/** Raw text a tool took or gave back, monospaced and wrapped; output scrolls past a height. */
export function Pre(props: { children: JSX.Element; tone?: "input" | "output" }): JSX.Element {
	return (
		<pre
			class={`overflow-x-auto whitespace-pre-wrap break-words rounded-kit px-2.5 py-1.5 font-mono text-caption ${props.tone === "output" ? "max-h-64 overflow-y-auto bg-fill text-fg-subtle" : "bg-fill-strong text-fg-muted"}`}
		>
			{props.children}
		</pre>
	);
}

export type PlanEntry = { text: string; status: "pending" | "in_progress" | "completed" };

/** An agent's plan: its steps, done ones ticked and struck, the current one ringed. */
export function PlanList(props: { entries: readonly PlanEntry[] }): JSX.Element {
	return (
		<ol class="surface-card flex flex-col gap-1 px-3 py-2.5 text-body">
			<For each={props.entries}>
				{(entry) => (
					<li
						class={`flex items-start gap-2 ${entry.status === "completed" ? "text-fg-faint line-through" : "text-fg-muted"}`}
					>
						<span class="mt-0.5 grid size-4 shrink-0 place-items-center">
							<Show
								when={entry.status === "completed"}
								fallback={
									<span
										class={`size-2.5 rounded-full ${entry.status === "in_progress" ? "bg-accent/30 ring-1 ring-accent" : "ring-1 ring-line-strong"}`}
									/>
								}
							>
								<CheckIcon size="sm" class="text-success" />
							</Show>
						</span>
						{entry.text}
					</li>
				)}
			</For>
		</ol>
	);
}

/** A line the run itself says: it restarted, it stopped, something failed. */
export function InlineNotice(props: {
	tone?: "info" | "error";
	children: JSX.Element;
}): JSX.Element {
	return (
		<p
			class={`flex items-start gap-2 text-body ${props.tone === "error" ? "text-danger" : "text-fg-subtle"}`}
		>
			<Show when={props.tone === "error"}>
				<AlertIcon size="sm" class="mt-0.5" />
			</Show>
			{props.children}
		</p>
	);
}

export type StepTone = "accent" | "success" | "violet" | "warning" | "danger" | "neutral";

const STEP_TINT: Record<StepTone, string> = {
	accent: "tint-accent",
	success: "tint-success",
	violet: "tint-violet",
	warning: "tint-warning",
	danger: "tint-danger",
	neutral: "bg-fill-strong text-fg-muted",
};

/** A step's glyph on its tinted 20px tile: blue edits, green new files, violet commands. */
export function StepGlyph(props: { tone: StepTone; children: JSX.Element }): JSX.Element {
	return (
		<span
			aria-hidden="true"
			class={`grid size-5 shrink-0 place-items-center rounded-kit-sm [&_svg]:size-3 ${STEP_TINT[props.tone]}`}
		>
			{props.children}
		</span>
	);
}

/**
 * An agent's run of steps as one card (the Figma "Worked for 1m 12s · 3 steps"): the kinds of
 * step it took as small tiles, how long it worked and how many steps, a status on the right, and
 * the steps one per row when opened.
 */
export function WorkCard(props: {
	glyphs: JSX.Element;
	title: JSX.Element;
	detail?: string;
	trailing?: JSX.Element;
	open?: boolean;
	children: JSX.Element;
}): JSX.Element {
	return (
		<details
			class="group/work overflow-hidden rounded-kit-lg bg-surface ring-line-strong"
			open={props.open}
		>
			<summary class="flex h-11 cursor-pointer list-none items-center gap-2 px-2.5 transition-colors duration-fast hover:bg-fill pointer-coarse:h-12 [&::-webkit-details-marker]:hidden">
				<span class="flex shrink-0 items-center gap-0.5">{props.glyphs}</span>
				<span class="ml-1 min-w-0 truncate font-medium text-body text-fg">{props.title}</span>
				<Show when={props.detail}>
					<span class="shrink-0 text-caption text-fg-subtle">{props.detail}</span>
				</Show>
				<span class="flex-1" />
				{props.trailing}
				<ChevronDownIcon
					size="xs"
					class="shrink-0 text-fg-subtle transition-transform duration-fast group-open/work:rotate-180"
				/>
			</summary>
			<div class="flex flex-col border-line border-t py-1">{props.children}</div>
		</details>
	);
}

/** One step in a `WorkCard` (WorkStep): its glyph, a verb, what it acted on as a chip, and a figure. */
export function WorkStep(props: {
	glyph: JSX.Element;
	verb: string;
	target: string;
	trailing?: JSX.Element;
	/** The step failed: said for screen readers, the glyph shows it for eyes. */
	failed?: boolean;
	children?: JSX.Element;
}): JSX.Element {
	const line = (
		<>
			{props.glyph}
			<span class="shrink-0 text-body text-fg-muted">{props.verb}</span>
			<span class="min-w-0 truncate rounded-kit-sm bg-fill-strong px-1.5 py-0.5 font-mono text-caption text-fg">
				{props.target}
			</span>
			<Show when={props.failed}>
				<span class="sr-only">(failed)</span>
			</Show>
			<span class="flex-1" />
			<Show when={props.trailing}>
				<span class="shrink-0 text-caption text-fg-subtle tabular-nums">{props.trailing}</span>
			</Show>
		</>
	);
	return (
		<Show
			when={props.children}
			fallback={
				<div class="flex min-h-9 items-center gap-2.5 px-2.5 py-1 pointer-coarse:min-h-11">
					{line}
				</div>
			}
		>
			<details class="group/step">
				<summary class="flex min-h-9 cursor-pointer list-none items-center gap-2.5 px-2.5 py-1 transition-colors duration-fast hover:bg-fill pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
					{line}
				</summary>
				<div class="px-2.5 pt-1 pb-2">{props.children}</div>
			</details>
		</Show>
	);
}

/** A command or a path inline, on the fill (the Figma approval's `git push …`). */
export function CodeChip(props: { children: JSX.Element }): JSX.Element {
	return (
		<code class="w-fit max-w-full truncate rounded-kit-sm bg-fill-strong px-1.5 py-0.5 font-mono text-caption text-fg">
			{props.children}
		</code>
	);
}

/** A project's mark on a 44px outlined tile, at the head of a new thread. */
export function ProjectTile(props: { children: JSX.Element }): JSX.Element {
	return (
		<span class="surface-outline grid size-11 shrink-0 place-items-center rounded-kit-lg">
			{props.children}
		</span>
	);
}
