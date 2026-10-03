import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";

import { Checkbox } from "./switch";
import {
	AlertIcon,
	BranchIcon,
	ChatIcon,
	CheckIcon,
	ChevronDownIcon,
	ClockIcon,
	CloseIcon,
	CodeIcon,
	PullRequestIcon,
} from "./icons";
import type { DiffLine } from "./message";

/* ------------------------------------------------------------------------------------------
 * Figma 18 · Pull requests. The list in the panel, a pull request as a document (heading, what
 * changed, its files, its history on the base, the review and the merge bar), and its changes as
 * a reviewer reads them: files viewed, conversations, the diff with its threads, and the review.
 * ---------------------------------------------------------------------------------------- */

/** How a pull request stands, as its glyph's tint. */
export type PullGlyphTone = "review" | "open" | "failing" | "draft" | "merged" | "closed";

const GLYPH_TINT: Record<PullGlyphTone, string> = {
	review: "tint-violet",
	open: "tint-accent",
	failing: "tint-danger",
	draft: "bg-fill-strong text-fg-muted",
	merged: "tint-violet",
	closed: "tint-danger",
};

/** A pull request's glyph: the pull request mark in a tile tinted by how it stands. */
export function PullGlyph(props: { tone: PullGlyphTone; size?: "sm" | "md" }): JSX.Element {
	return (
		<span
			aria-hidden="true"
			class={`grid shrink-0 place-items-center rounded-kit ${GLYPH_TINT[props.tone]} ${props.size === "md" ? "size-7 [&_svg]:size-4" : "size-5 [&_svg]:size-3.5"}`}
		>
			<PullRequestIcon />
		</span>
	);
}

/** A caption over a group of pull requests: Needs your review, Open. */
export function PullGroupLabel(props: { children: JSX.Element; phone?: boolean }): JSX.Element {
	return (
		<h3
			class={`font-medium text-caption text-fg-subtle ${props.phone ? "px-1 pt-4 pb-1" : "px-2 pt-2 pb-1"}`}
		>
			{props.children}
		</h3>
	);
}

/**
 * A pull request in the panel (Figma PR row): its glyph, title and age, then who made it (an
 * agent's logo) and its number with its branch or state.
 */
export function PullPanelRow(props: {
	href: string;
	title: string;
	time: string;
	line: string;
	tone: PullGlyphTone;
	/** Before the line: the agent's logo, or the author's mark. */
	who?: JSX.Element;
	current?: boolean;
}): JSX.Element {
	return (
		<a
			href={props.href}
			aria-current={props.current ? "page" : undefined}
			class="focus-ring flex min-w-0 items-start gap-2 rounded-kit-md p-2 transition-colors duration-fast hover:bg-fill aria-[current=page]:bg-fill-strong"
		>
			<PullGlyph tone={props.tone} />
			<span class="flex min-w-0 flex-1 flex-col gap-0.5">
				<span class="flex min-w-0 items-center gap-1">
					<span class="min-w-0 flex-1 truncate font-medium text-body text-fg">{props.title}</span>
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

/** Checks at a glance on the phone's list: passed, running or failing. */
export function PullStatusMark(props: {
	checks: "passing" | "failing" | "pending" | "none";
}): JSX.Element {
	return (
		<span class="grid size-5 shrink-0 place-items-center [&_svg]:size-4">
			<Show when={props.checks === "passing"}>
				<CheckIcon class="text-success" />
			</Show>
			<Show when={props.checks === "pending"}>
				<ClockIcon class="text-warning" />
			</Show>
			<Show when={props.checks === "failing"}>
				<CloseIcon class="text-danger" />
			</Show>
		</span>
	);
}

/** A pull request on the phone's list: glyph, title, who and when, and its checks. */
export function PullListRow(props: {
	href: string;
	title: string;
	line: string;
	tone: PullGlyphTone;
	who?: JSX.Element;
	checks: "passing" | "failing" | "pending" | "none";
}): JSX.Element {
	return (
		<a
			href={props.href}
			class="focus-ring flex min-h-15 min-w-0 items-center gap-3 border-line border-b py-2.5 last:border-b-0"
		>
			<PullGlyph tone={props.tone} size="md" />
			<span class="flex min-w-0 flex-1 flex-col gap-0.5">
				<span class="truncate text-body-lg text-fg">{props.title}</span>
				<span class="flex min-w-0 items-center gap-1.5 text-caption text-fg-subtle [&_img]:size-3 [&_svg]:size-3">
					{props.who}
					<span class="truncate">{props.line}</span>
				</span>
			</span>
			<PullStatusMark checks={props.checks} />
		</a>
	);
}

/** The document's column: the pull request read top to bottom, 680px wide on desktop. */
export function PullColumn(props: { children: JSX.Element }): JSX.Element {
	return (
		<div class="mx-auto flex w-full max-w-170 flex-col gap-6 px-4 pt-4 pb-8 md:px-0 md:pt-12">
			{props.children}
		</div>
	);
}

/** Where a pull request goes, under its title: its branch into its base. */
export function PullBranch(props: { from: string; to: string }): JSX.Element {
	return (
		<span class="flex min-w-0 items-center gap-1.5 [&_svg]:size-3.5">
			<BranchIcon class="shrink-0 text-violet" />
			<span class="truncate text-fg-muted">
				{props.from} → {props.to}
			</span>
		</span>
	);
}

/** One fact under the heading (Figma Status): a mark and its words. */
export type PullFactItem = {
	text: string;
	tone: "success" | "warning" | "danger" | "neutral";
	/** In place of the mark: an agent's logo ("Approved by Codex"). */
	lead?: JSX.Element;
};

/** The facts under the heading: checks, review, conflicts. */
export function PullFacts(props: { facts: readonly PullFactItem[] }): JSX.Element {
	return (
		<ul class="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-body text-fg-muted">
			<For each={props.facts}>
				{(fact) => (
					<li class="flex items-center gap-1.5 [&_img]:size-3.5 [&_svg]:size-3.5">
						<Show
							when={fact.lead}
							fallback={
								<Show
									when={fact.tone === "success"}
									fallback={
										<Show
											when={fact.tone === "warning"}
											fallback={
												fact.tone === "danger" ? (
													<AlertIcon class="text-danger" />
												) : (
													<ClockIcon class="text-fg-subtle" />
												)
											}
										>
											<ClockIcon class="text-warning" />
										</Show>
									}
								>
									<CheckIcon class="text-success" />
								</Show>
							}
						>
							{fact.lead}
						</Show>
						<span>{fact.text}</span>
					</li>
				)}
			</For>
		</ul>
	);
}

/** A section of the document under a quiet caption, with something on the right of it. */
export function PullSection(props: {
	label: string;
	/** Before the caption: who wrote it (an agent's logo). */
	lead?: JSX.Element;
	aside?: JSX.Element;
	children: JSX.Element;
}): JSX.Element {
	return (
		<section aria-label={props.label} class="flex flex-col gap-2 border-line border-t pt-5">
			<div class="flex min-w-0 items-center gap-1.5 text-caption text-fg-subtle [&_img]:size-3.5 [&_svg]:size-3.5">
				{props.lead}
				<h2 class="font-normal">{props.label}</h2>
				<span class="flex-1" />
				<span class="shrink-0">{props.aside}</span>
			</div>
			{props.children}
		</section>
	);
}

/** Lines added and removed, green and red. */
export function PullStat(props: { added: number; removed: number }): JSX.Element {
	return (
		<span class="shrink-0 text-caption tabular-nums">
			<Show when={props.added}>
				<span class="text-success">+{props.added}</span>
			</Show>
			<Show when={props.added && props.removed}> </Show>
			<Show when={props.removed}>
				<span class="text-danger">−{props.removed}</span>
			</Show>
		</span>
	);
}

/** A changed file in the document's Changes: its icon, path and counts. */
export function PullFileRow(props: {
	icon: JSX.Element;
	path: string;
	added: number;
	removed: number;
	href?: string;
}): JSX.Element {
	const inside = () => (
		<>
			<span class="grid size-4 shrink-0 place-items-center [&_img]:size-4">{props.icon}</span>
			<span class="min-w-0 flex-1 truncate text-body text-fg">{props.path}</span>
			<PullStat added={props.added} removed={props.removed} />
		</>
	);
	return (
		<Show
			when={props.href}
			fallback={
				<div class="flex min-w-0 items-center gap-2 border-line border-b py-2.5 last:border-b-0">
					{inside()}
				</div>
			}
		>
			{(href) => (
				<a
					href={href()}
					class="focus-ring flex min-w-0 items-center gap-2 border-line border-b py-2.5 transition-colors duration-fast last:border-b-0 hover:bg-fill"
				>
					{inside()}
				</a>
			)}
		</Show>
	);
}

/** A row of the history (Figma Graph): which lane it sits on and how it is marked. */
export type HistoryRow = {
	key: string;
	subject: string;
	/** The base's line, the branch's, or where the branch left the base. */
	lane: "base" | "branch" | "fork";
	/** A ref beside it: the base's name, the branch's, a tag. */
	ref?: { name: string; tone: "base" | "branch" };
	/** The branch's newest commit, drawn as a ringed dot. */
	head?: boolean;
	/** Who made it: an agent's logo or the author's initials. */
	who: JSX.Element;
	when: string;
};

/**
 * The branch's history on its base (Figma History): the base's line in grey, the branch's in
 * violet beside it and curving back to where it left, each commit with who made it and when.
 */
export function PullHistoryGraph(props: {
	rows: readonly HistoryRow[];
	foot?: JSX.Element;
}): JSX.Element {
	return (
		<div class="flex flex-col">
			<For each={props.rows}>
				{(row, index) => (
					<div class="relative flex h-10 min-w-0 items-center gap-2 pl-10">
						{/* The base's line runs the whole height; the branch's beside it. */}
						<span
							aria-hidden="true"
							class={`absolute left-2 w-px bg-line-strong ${index() === 0 ? "top-1/2 bottom-0" : index() === props.rows.length - 1 ? "top-0 bottom-0" : "inset-y-0"}`}
						/>
						<Show when={row.lane === "branch"}>
							<span aria-hidden="true" class="absolute inset-y-0 left-5.5 w-px bg-violet" />
						</Show>
						<Show when={row.lane === "fork"}>
							<span
								aria-hidden="true"
								class="absolute top-0 left-2 h-1/2 w-3.5 rounded-bl-kit-lg border-violet border-b border-l"
							/>
						</Show>
						<span
							aria-hidden="true"
							class={`absolute top-1/2 -translate-y-1/2 rounded-full border bg-surface ${row.lane === "branch" ? (row.head ? "left-4 size-3.5 border-violet bg-violet ring-4 ring-violet/20" : "left-4.5 size-2.5 border-violet") : "left-1 size-2.5 border-fg-faint"}`}
						/>
						<span
							class={`min-w-0 truncate text-body ${row.lane === "branch" ? "text-fg" : "text-fg-muted"}`}
						>
							{row.subject}
						</span>
						<Show when={row.ref}>
							{(ref) => (
								<span
									class={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-caption ${ref().tone === "branch" ? "tint-violet" : "bg-fill-strong text-fg-muted"}`}
								>
									<span aria-hidden="true" class="size-1.5 rounded-full bg-current" />
									{ref().name}
								</span>
							)}
						</Show>
						<span class="flex-1" />
						<span class="flex shrink-0 items-center gap-2 text-caption text-fg-subtle tabular-nums [&_img]:size-3.5 [&_svg]:size-3.5">
							{row.who}
							<span>{row.when}</span>
						</span>
					</div>
				)}
			</For>
			<Show when={props.foot}>
				<div class="pt-2 pl-10 text-caption text-fg-subtle">{props.foot}</div>
			</Show>
		</div>
	);
}

/** The review row (Figma Review): who decided, what is left, and the way into the changes. */
export function PullReviewRow(props: {
	mark: JSX.Element;
	title: string;
	detail?: string;
	action?: JSX.Element;
}): JSX.Element {
	return (
		<div class="flex min-w-0 items-center gap-3 border-line border-y py-3.5">
			<span class="grid size-5 shrink-0 place-items-center [&_img]:size-4 [&_svg]:size-4">
				{props.mark}
			</span>
			<span class="flex min-w-0 flex-1 flex-col">
				<span class="truncate text-body text-fg">{props.title}</span>
				<Show when={props.detail}>
					<span class="truncate text-caption text-fg-subtle">{props.detail}</span>
				</Show>
			</span>
			{props.action}
		</div>
	);
}

/** The merge bar (Figma Merge bar): ready or not, how it will merge, and the buttons. */
export function PullMergeBar(props: {
	ready: boolean;
	title: string;
	detail: string;
	actions: JSX.Element;
}): JSX.Element {
	return (
		<div class="surface-card flex flex-col gap-3 p-4 md:flex-row md:items-center">
			<span class="flex min-w-0 flex-1 items-start gap-3">
				<span
					class={`grid size-5 shrink-0 place-items-center pt-0.5 [&_svg]:size-4 ${props.ready ? "text-success" : "text-warning"}`}
				>
					{props.ready ? <CheckIcon /> : <AlertIcon />}
				</span>
				<span class="flex min-w-0 flex-col">
					<span class="font-medium text-body text-fg">{props.title}</span>
					<span class="text-caption text-fg-subtle">{props.detail}</span>
				</span>
			</span>
			<span class="flex shrink-0 items-center gap-2">{props.actions}</span>
		</div>
	);
}

/** A file in the review's tree: its icon and name, its comments, and whether it is viewed. */
export function ReviewFileRow(props: {
	icon: JSX.Element;
	name: string;
	depth: number;
	comments: number;
	viewed: boolean;
	current?: boolean;
	onClick: () => void;
}): JSX.Element {
	return (
		<button
			type="button"
			aria-current={props.current ? "true" : undefined}
			onClick={() => props.onClick()}
			class={`focus-ring flex h-kit-row w-full min-w-0 items-center gap-2 rounded-kit-md pr-2 text-left text-nav text-fg transition-colors duration-fast hover:bg-fill aria-[current=true]:bg-fill-strong ${props.depth ? "pl-8" : "pl-2"}`}
		>
			<span class="grid size-4 shrink-0 place-items-center [&_img]:size-4">{props.icon}</span>
			<span class="min-w-0 flex-1 truncate">{props.name}</span>
			<Show when={props.comments}>
				<span class="flex items-center gap-1 text-accent text-caption [&_svg]:size-3.5">
					<ChatIcon />
					{props.comments}
				</span>
			</Show>
			<Show when={props.viewed}>
				<CheckIcon class="size-3.5 text-success" />
			</Show>
		</button>
	);
}

/** A conversation in the review's panel: resolved or open, what it says, where it hangs. */
export function ReviewConversationRow(props: {
	resolved: boolean;
	title: string;
	detail: string;
	onClick: () => void;
}): JSX.Element {
	return (
		<button
			type="button"
			onClick={() => props.onClick()}
			class="focus-ring flex w-full min-w-0 items-start gap-2 rounded-kit-md p-2 text-left transition-colors duration-fast hover:bg-fill"
		>
			<span
				class={`grid size-4 shrink-0 place-items-center pt-0.5 [&_svg]:size-3.5 ${props.resolved ? "text-success" : "text-accent"}`}
			>
				{props.resolved ? <CheckIcon /> : <ChatIcon />}
			</span>
			<span class="flex min-w-0 flex-col">
				<span class="truncate text-body text-fg">{props.title}</span>
				<span class="truncate text-caption text-fg-subtle">{props.detail}</span>
			</span>
		</button>
	);
}

/** Viewed files out of all, as a bar (Figma Progress). */
export function ReviewProgress(props: { done: number; total: number }): JSX.Element {
	return (
		<span aria-hidden="true" class="block h-1 overflow-hidden rounded-full bg-fill-strong">
			<span
				class="block h-full rounded-full bg-success transition-[width] duration-base"
				style={{ width: `${props.total ? (props.done / props.total) * 100 : 0}%` }}
			/>
		</span>
	);
}

type CodeLine = Exclude<DiffLine, { kind: "hunk" }>;

/** Where a line is, for comments: the new side for added and unchanged lines, the old for removed. */
export function lineSide(line: CodeLine): { side: "LEFT" | "RIGHT"; line: number } | null {
	if (line.kind === "del") return line.old ? { side: "LEFT", line: line.old } : null;
	const number = line.new ?? null;
	return number ? { side: "RIGHT", line: number } : null;
}

const ROW_TONE = { add: "bg-success/10", del: "bg-danger/10", context: "" } as const;
const ROW_MARK = { add: "+", del: "−", context: "" } as const;

/**
 * A changed file as a reviewer reads it (Figma File · eta.ts): a header that folds it, its counts
 * and Viewed; its lines unified or side by side, each with a way to comment on it; and under a
 * line, whatever hangs there (its threads, a comment being written).
 */
export function ReviewDiffFile(props: {
	icon: JSX.Element;
	path: string;
	added: number;
	removed: number;
	lines: readonly DiffLine[];
	/** The same lines side by side, when the split view is on. */
	split?: readonly (
		| { kind: "hunk"; text: string }
		| { kind: "pair"; left: CodeLine | null; right: CodeLine | null }
	)[];
	open: boolean;
	onToggle: () => void;
	viewed: boolean;
	onViewed: (viewed: boolean) => void;
	/** What hangs under a line (threads, a draft), by its side and number. */
	under: (side: "LEFT" | "RIGHT", line: number) => JSX.Element | null;
	/** Start a comment on a line; absent where comments cannot be left. */
	onComment?: (side: "LEFT" | "RIGHT", line: number) => void;
}): JSX.Element {
	const commentButton = (line: CodeLine) => {
		const at = lineSide(line);
		return (
			<Show when={props.onComment && at}>
				{(where) => (
					<button
						type="button"
						aria-label={`Comment on line ${where().line}`}
						onClick={() => props.onComment?.(where().side, where().line)}
						class="focus-ring absolute top-0.5 left-1 grid size-4 place-items-center rounded-kit-xs bg-accent text-accent-foreground opacity-0 transition-opacity duration-fast group-hover/line:opacity-100 focus-visible:opacity-100 pointer-coarse:hidden [&_svg]:size-3"
					>
						<ChatIcon />
					</button>
				)}
			</Show>
		);
	};
	const hangs = (line: CodeLine | null) => {
		const at = line ? lineSide(line) : null;
		return at ? props.under(at.side, at.line) : null;
	};
	return (
		<section aria-label={props.path} class="surface-card overflow-hidden">
			<header class="flex h-11 min-w-0 items-center gap-2 border-line border-b px-3">
				<button
					type="button"
					aria-expanded={props.open ? "true" : "false"}
					aria-label={props.open ? `Fold ${props.path}` : `Unfold ${props.path}`}
					onClick={() => props.onToggle()}
					class="focus-ring grid size-6 shrink-0 place-items-center rounded-kit-sm text-fg-subtle hover:bg-fill [&_svg]:size-3.5"
				>
					<ChevronDownIcon class={props.open ? "" : "-rotate-90"} />
				</button>
				<span class="grid size-4 shrink-0 place-items-center [&_img]:size-4">{props.icon}</span>
				<span class="min-w-0 truncate font-medium text-body text-fg" title={props.path}>
					{props.path}
				</span>
				<PullStat added={props.added} removed={props.removed} />
				<span class="flex-1" />
				<span class="flex shrink-0 items-center gap-1.5 text-caption text-fg-muted">
					<Checkbox
						label={`${props.path} viewed`}
						checked={props.viewed}
						onChange={(checked) => props.onViewed(checked)}
					/>
					<span aria-hidden="true">Viewed</span>
				</span>
			</header>
			<Show when={props.open}>
				<div class="overflow-x-auto font-mono text-caption leading-6">
					<Show
						when={props.split}
						fallback={
							<For each={props.lines}>
								{(line) =>
									line.kind === "hunk" ? (
										<div class="bg-fill px-3 text-fg-faint">{line.text}</div>
									) : (
										<>
											<div class={`group/line relative flex min-w-0 ${ROW_TONE[line.kind]}`}>
												{commentButton(line)}
												<span class="w-10 shrink-0 select-none pr-2 text-right text-fg-faint tabular-nums max-md:hidden">
													{line.old ?? ""}
												</span>
												<span class="w-10 shrink-0 select-none pr-2 text-right text-fg-faint tabular-nums">
													{line.new ?? ""}
												</span>
												<span
													class={`w-4 shrink-0 select-none ${line.kind === "add" ? "text-success" : "text-danger"}`}
												>
													{ROW_MARK[line.kind]}
												</span>
												<Show
													when={line.html}
													fallback={
														<code class="min-w-0 flex-1 whitespace-pre pr-4 text-fg">
															{line.text || " "}
														</code>
													}
												>
													<code
														class="min-w-0 flex-1 whitespace-pre pr-4 text-fg"
														innerHTML={line.html}
													/>
												</Show>
											</div>
											{hangs(line)}
										</>
									)
								}
							</For>
						}
					>
						{(rows) => (
							<For each={rows()}>
								{(row) =>
									row.kind === "hunk" ? (
										<div class="bg-fill px-3 text-fg-faint">{row.text}</div>
									) : (
										<>
											<div class="flex min-w-0">
												<For each={[row.left, row.right]}>
													{(cell, index) => (
														<div
															class={`group/line relative flex min-w-0 flex-1 basis-0 ${cell ? ROW_TONE[cell.kind === "context" ? "context" : cell.kind] : "bg-fill"} ${index() === 0 ? "border-line border-r" : ""}`}
														>
															<Show when={cell}>
																{(code) => (
																	<>
																		{commentButton(code())}
																		<span class="w-10 shrink-0 select-none pr-2 text-right text-fg-faint tabular-nums">
																			{index() === 0 ? (code().old ?? "") : (code().new ?? "")}
																		</span>
																		<Show
																			when={code().html}
																			fallback={
																				<code class="min-w-0 flex-1 whitespace-pre pr-4 text-fg">
																					{code().text || " "}
																				</code>
																			}
																		>
																			<code
																				class="min-w-0 flex-1 whitespace-pre pr-4 text-fg"
																				innerHTML={code().html}
																			/>
																		</Show>
																	</>
																)}
															</Show>
														</div>
													)}
												</For>
											</div>
											{hangs(row.right ?? row.left)}
											{row.left && row.left !== row.right && row.left.kind === "del"
												? hangs(row.left)
												: null}
										</>
									)
								}
							</For>
						)}
					</Show>
				</div>
			</Show>
		</section>
	);
}

/** Under a line: its conversation, inset from the code (Figma Thread). */
export function ReviewThreadBlock(props: { children: JSX.Element }): JSX.Element {
	return (
		<div class="flex flex-col gap-4 border-line border-y bg-surface px-4 py-4 font-kit md:pl-24">
			{props.children}
		</div>
	);
}

/** One comment in a thread (Figma Comment): who, what they are, when, and what they said. */
export function ReviewComment(props: {
	mark: JSX.Element;
	who: string;
	/** What they are here ("Code reviewer", "draft"). */
	kind?: string;
	when: string;
	resolved?: boolean;
	children: JSX.Element;
}): JSX.Element {
	return (
		<article class="flex min-w-0 flex-col gap-1.5">
			<header class="flex min-w-0 items-center gap-2 text-body [&_img]:size-4 [&_svg]:size-4">
				{props.mark}
				<span class="font-medium text-fg">{props.who}</span>
				<span class="truncate text-caption text-fg-subtle">
					{[props.kind, props.when].filter(Boolean).join(" · ")}
				</span>
				<span class="flex-1" />
				<Show when={props.resolved}>
					<span class="flex shrink-0 items-center gap-1 rounded-full tint-success px-2 py-0.5 text-caption">
						<span aria-hidden="true" class="size-1.5 rounded-full bg-current" />
						Resolved
					</span>
				</Show>
			</header>
			<div class="flex min-w-0 flex-col gap-2 text-body text-fg-muted">{props.children}</div>
		</article>
	);
}

/** A suggested change in a comment (Figma Suggested change): the line as it is, and as suggested. */
export function ReviewSuggestion(props: {
	before: readonly string[];
	after: readonly string[];
}): JSX.Element {
	return (
		<figure class="overflow-hidden rounded-kit-md ring-line">
			<figcaption class="flex items-center gap-1.5 border-line border-b px-3 py-1.5 text-caption text-fg-muted [&_svg]:size-3.5">
				<CodeIcon />
				Suggested change
			</figcaption>
			<div class="font-mono text-caption leading-6">
				<For each={props.before}>
					{(line) => (
						<div class="flex bg-danger/10 px-3">
							<span class="w-4 shrink-0 text-danger">−</span>
							<span class="whitespace-pre text-fg">{line}</span>
						</div>
					)}
				</For>
				<For each={props.after}>
					{(line) => (
						<div class="flex bg-success/10 px-3">
							<span class="w-4 shrink-0 text-success">+</span>
							<span class="whitespace-pre text-fg">{line}</span>
						</div>
					)}
				</For>
			</div>
		</figure>
	);
}

/** Writing a comment on a line (Figma Your comment): the words, and Cancel or Comment. */
export function ReviewCommentBox(props: {
	value: string;
	onInput: (value: string) => void;
	onCancel: () => void;
	onSave: () => void;
	saveLabel?: string;
}): JSX.Element {
	return (
		<div class="flex flex-col gap-2 rounded-kit-lg p-3 ring-2 ring-accent">
			<textarea
				aria-label="Your comment"
				value={props.value}
				placeholder="Leave a comment on this line"
				rows={2}
				onInput={(event) => props.onInput(event.currentTarget.value)}
				onKeyDown={(event) => {
					if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) props.onSave();
					if (event.key === "Escape") props.onCancel();
				}}
				class="w-full resize-none bg-transparent text-body text-fg outline-none placeholder:text-fg-faint"
			/>
			<div class="flex items-center justify-end gap-2">
				<button
					type="button"
					onClick={() => props.onCancel()}
					class="focus-ring inline-flex h-kit-control-sm items-center rounded-full px-3 text-caption text-fg-muted hover:bg-fill hover:text-fg"
				>
					Cancel
				</button>
				<button
					type="button"
					disabled={!props.value.trim()}
					onClick={() => props.onSave()}
					class="focus-ring inline-flex h-kit-control-sm items-center rounded-full bg-inverse px-3 font-medium text-caption text-inverse-fg disabled:opacity-40"
				>
					{props.saveLabel ?? "Comment"}
				</button>
			</div>
		</div>
	);
}

/** The review bar along the foot (Figma Review bar): what you have so far, the verdict, Submit. */
export function ReviewBar(props: {
	title: string;
	detail: string;
	children: JSX.Element;
}): JSX.Element {
	return (
		<div class="surface-card flex flex-col gap-3 p-3 md:flex-row md:items-center md:pl-4">
			<span class="flex min-w-0 flex-1 flex-col">
				<span class="font-medium text-body text-fg">{props.title}</span>
				<span class="truncate text-caption text-fg-subtle">{props.detail}</span>
			</span>
			<span class="flex shrink-0 flex-wrap items-center gap-2">{props.children}</span>
		</div>
	);
}
