import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, createSignal, Show, untrack } from "solid-js";

import {
	AgentLogo,
	Alert,
	Avatar,
	BackIcon,
	Button,
	button,
	Dialog,
	EntryIcon,
	ExternalIcon,
	EyeIcon,
	type HistoryRow,
	IconButton,
	iconButton,
	LinkButton,
	Menu,
	type MenuGroup,
	MoreIcon,
	notify,
	Prose,
	PullBranch,
	PullColumn,
	PullFacts,
	type PullFactItem,
	PullFileRow,
	PullHistoryGraph,
	PullMergeBar,
	PullReviewRow,
	PullSection,
	PullStat,
	Skeleton,
	Stack,
	Text,
} from "@/kit";
import { useAuth } from "@/modules/auth";
import { renderMarkdown } from "@/modules/chat/lib/markdown";
import { agentName } from "@/modules/chat/stores/providers";
import { placementsStore } from "@/modules/environments";
import { relativeTime } from "@/modules/projects/lib/relative-time";
import { ShellSlot } from "@/modules/shell";

import {
	aheadBehind,
	agentOf,
	checksFact,
	conflictsFact,
	madeBy,
	mergeLine,
	reviewFact,
	reviewSummary,
} from "../lib/pull-look";
import { mergeBlocker } from "../lib/pulls";
import { pullsService } from "../services/pulls.service";
import type {
	MergeMethod,
	PullCommit,
	PullDetail,
	PullHistory,
	PullReview,
} from "../types/github.types";

import { FixWithAgentSheet } from "./fix-with-agent-sheet";

const MERGE_VERB: Record<MergeMethod, string> = {
	squash: "Squash and merge",
	merge: "Merge",
	rebase: "Rebase and merge",
};

function message(cause: unknown, fallback: string): string {
	return cause instanceof Error ? cause.message : fallback;
}

/**
 * A pull request as a document (Figma 18 · Pull request): its title, where it goes and who made
 * it, the facts (checks, review, conflicts), what changed, its files, its history on the base,
 * the review so far, and the merge bar.
 */
export function PullDocument(props: {
	project: string;
	number: number;
	changesHref: string;
	onBack: () => void;
	/** Something changed on GitHub: the list reads again. */
	onChanged: () => void;
}): JSX.Element {
	const auth = useAuth();
	const scope = () => placementsStore.scopeOf(props.project);
	const nameOf = (agent: string) => agentName(agent, scope());
	const [pull, setPull] = createSignal<PullDetail | null>(null);
	const [history, setHistory] = createSignal<PullHistory | null>(null);
	const [review, setReview] = createSignal<PullReview | null>(null);
	const [error, setError] = createSignal<string | null>(null);
	const [busy, setBusy] = createSignal(false);
	const [merging, setMerging] = createSignal<MergeMethod | null>(null);
	const [fixing, setFixing] = createSignal(false);

	function load(): void {
		const token = auth.token();
		const { project, number } = props;
		if (!token) return;
		const still = () =>
			project === untrack(() => props.project) && number === untrack(() => props.number);
		pullsService.view(token, project, number).then(
			(next) => {
				if (!still()) return;
				setPull(next);
				setError(null);
			},
			(cause) => {
				if (still()) setError(message(cause, "Could not open this pull request"));
			},
		);
		// The history and the review fill in after: the document reads without them.
		pullsService.history(token, project, number).then(
			(next) => {
				if (still()) setHistory(next);
			},
			() => undefined,
		);
		pullsService.review(token, project, number).then(
			(next) => {
				if (still()) setReview(next);
			},
			() => undefined,
		);
	}

	createEffect(
		() => [auth.token(), props.project, props.number] as const,
		() => {
			setPull(null);
			setHistory(null);
			setReview(null);
			setError(null);
			load();
		},
	);

	/** Do something on GitHub, then read the pull request (and the list) again. */
	async function act(work: (token: string) => Promise<void>, done: string): Promise<boolean> {
		const token = auth.token();
		if (!token || busy()) return false;
		setBusy(true);
		try {
			await work(token);
			notify({ title: done, tone: "success" });
			load();
			props.onChanged();
			return true;
		} catch (cause) {
			notify({ title: message(cause, "GitHub did not do that"), tone: "danger" });
			return false;
		} finally {
			setBusy(false);
		}
	}

	const facts = createMemo((): PullFactItem[] => {
		const current = pull();
		if (!current) return [];
		const said = reviewFact(current, review(), nameOf);
		return [
			checksFact(current.checkList),
			said && {
				...said,
				lead: said.agent ? <AgentLogo id={said.agent} name={nameOf(said.agent)} /> : undefined,
			},
			conflictsFact(current),
		].filter((fact): fact is PullFactItem => Boolean(fact));
	});

	const commitRow = (
		commit: PullCommit,
		lane: HistoryRow["lane"],
		extra: Partial<HistoryRow> = {},
	): HistoryRow => ({
		key: commit.sha,
		subject: commit.subject,
		lane,
		who: commit.agent ? (
			<AgentLogo id={commit.agent} name={nameOf(commit.agent)} />
		) : (
			<Avatar name={commit.author} size="xs" />
		),
		when: commit.at ? relativeTime(commit.at) : "",
		...(commit.tags[0] ? { ref: { name: commit.tags[0], tone: "base" as const } } : {}),
		...extra,
	});
	/** The history as the graph draws it: the base's tip, the branch's commits, where it left. */
	const rows = createMemo((): HistoryRow[] => {
		const shown = history();
		const current = pull();
		if (!shown || !current) return [];
		return [
			...(shown.baseTip
				? [commitRow(shown.baseTip, "base", { ref: { name: shown.base, tone: "base" } })]
				: []),
			...shown.commits.map((commit, index) =>
				commitRow(
					commit,
					"branch",
					index === 0 ? { head: true, ref: { name: current.branch, tone: "branch" } } : {},
				),
			),
			...(shown.mergeBase ? [commitRow(shown.mergeBase, "fork")] : []),
		];
	});

	const summary = () => {
		const shown = review();
		const current = pull();
		return shown && current ? reviewSummary(shown, current.author, nameOf) : null;
	};

	const menuGroups = (): MenuGroup[] => {
		const current = pull();
		if (!current || current.state !== "OPEN") return [];
		return [
			{
				items: [
					{ id: "fix", label: "Fix with an agent" },
					current.draft
						? { id: "ready", label: "Ready for review" }
						: { id: "draft", label: "Back to draft" },
				],
			},
			{
				items: [
					{ id: "merge", label: "Merge with a merge commit" },
					{ id: "rebase", label: "Rebase and merge" },
				],
			},
			{ items: [{ id: "close", label: "Close pull request", danger: true }] },
		];
	};
	const onMenu = (id: string) => {
		if (id === "fix") setFixing(true);
		else if (id === "ready" || id === "draft" || id === "close")
			void act(
				(token) => pullsService.act(token, props.project, props.number, id),
				id === "ready"
					? "Ready for review"
					: id === "draft"
						? "Back to draft"
						: "Pull request closed",
			);
		else if (id === "merge" || id === "rebase") setMerging(id);
	};
	const menu = (phone: boolean) => (
		<Show when={menuGroups().length}>
			<Menu
				label="Pull request"
				title={phone ? "Pull request" : undefined}
				trigger={<MoreIcon />}
				triggerClass={
					phone
						? iconButton({ size: "lg", shape: "round", variant: "secondary" })
						: iconButton({ size: "sm" })
				}
				placement="bottom-end"
				groups={menuGroups()}
				onSelect={onMenu}
			/>
		</Show>
	);

	const blocker = () => {
		const current = pull();
		if (!current) return null;
		return mergeBlocker(current) ?? (current.checks === "failing" ? "Checks are failing" : null);
	};

	return (
		<div class="flex min-h-0 flex-1 flex-col">
			<ShellSlot name="crumb">#{props.number}</ShellSlot>
			<ShellSlot name="actions">
				<Show when={pull()}>
					{(current) => (
						<a
							href={current().url}
							target="_blank"
							rel="noopener noreferrer"
							class={button({ size: "sm", variant: "ghost" })}
						>
							<ExternalIcon size="sm" />
							Open on GitHub
						</a>
					)}
				</Show>
				{menu(false)}
			</ShellSlot>
			<ShellSlot name="heading">
				<div class="flex min-w-0 flex-col items-center">
					<Text as="h1" tone="strong" weight="medium" size="body-lg" truncate>
						Pull request
					</Text>
					<Text size="caption" tone="subtle" truncate>
						{props.project}
					</Text>
				</div>
			</ShellSlot>
			<ShellSlot name="leading">
				<IconButton
					label="All pull requests"
					variant="secondary"
					shape="round"
					size="lg"
					onClick={props.onBack}
				>
					<BackIcon />
				</IconButton>
			</ShellSlot>
			<ShellSlot name="trailing">{menu(true)}</ShellSlot>

			<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
				<Show when={error()}>
					{(reason) => (
						<div class="mx-auto flex max-w-170 flex-col gap-2 p-4">
							<Alert tone="danger" title={reason()} />
							<div>
								<Button size="sm" onClick={load}>
									Try again
								</Button>
							</div>
						</div>
					)}
				</Show>
				<Show
					when={pull()}
					fallback={
						<Show when={!error()}>
							<PullColumn>
								<Skeleton class="h-8 w-2/3" />
								<Skeleton class="h-4 w-1/2" />
								<Skeleton class="h-24" />
							</PullColumn>
						</Show>
					}
				>
					{(current) => (
						<PullColumn>
							<header class="flex flex-col gap-3">
								<Text as="h1" size="headline" tone="strong" weight="medium">
									{current().title}
								</Text>
								<div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-body text-fg-subtle [&_img]:size-3.5 [&_svg]:size-3.5">
									<span>#{current().number}</span>
									<PullBranch from={current().branch} to={current().base} />
									<span aria-hidden="true">·</span>
									<Show
										when={agentOf(current())}
										fallback={<Avatar name={current().author} size="xs" />}
									>
										{(agent) => <AgentLogo id={agent()} name={nameOf(agent())} />}
									</Show>
									<span class="text-fg-muted">
										{madeBy(current())} · {relativeTime(current().createdAt ?? current().updatedAt)}
									</span>
								</div>
								<PullFacts facts={facts()} />
							</header>

							<Show when={current().body.trim()}>
								<PullSection
									label="What changed"
									lead={
										agentOf(current()) ? (
											<AgentLogo
												id={agentOf(current()) ?? ""}
												name={nameOf(agentOf(current()) ?? "")}
											/>
										) : undefined
									}
								>
									<Prose html={renderMarkdown(current().body)} />
								</PullSection>
							</Show>

							<PullSection
								label="Changes"
								aside={<PullStat added={current().additions} removed={current().deletions} />}
							>
								<div class="flex flex-col">
									{current().files.map((file) => (
										<PullFileRow
											icon={
												<EntryIcon name={file.path.split("/").pop() ?? file.path} folder={false} />
											}
											path={file.path}
											added={file.additions}
											removed={file.deletions}
											href={props.changesHref}
										/>
									))}
								</div>
							</PullSection>

							<PullSection
								label="History"
								aside={
									<Show when={history()}>
										{(shown) =>
											current().state === "OPEN"
												? aheadBehind(shown())
												: `${shown().commits.length} commit${shown().commits.length === 1 ? "" : "s"}`
										}
									</Show>
								}
							>
								<Show
									when={history()}
									fallback={
										<Stack gap={2}>
											<Skeleton class="h-6" />
											<Skeleton class="h-6" />
										</Stack>
									}
								>
									{(shown) => (
										<PullHistoryGraph
											rows={rows()}
											foot={
												shown().behind && current().state === "OPEN" && !current().fork ? (
													<>
														{shown().base} moved on by {shown().behind} commit
														{shown().behind === 1 ? "" : "s"}.{" "}
														<LinkButton
															tone="accent"
															disabled={busy()}
															onClick={() =>
																void act(
																	(token) =>
																		pullsService.rebase(token, props.project, props.number),
																	`Rebased ${current().branch}`,
																)
															}
														>
															Rebase {current().branch}
														</LinkButton>
													</>
												) : undefined
											}
										/>
									)}
								</Show>
							</PullSection>

							<Show when={summary()}>
								{(said) => (
									<PullReviewRow
										mark={
											said().agent ? (
												<AgentLogo id={said().agent ?? ""} name={nameOf(said().agent ?? "")} />
											) : (
												<EyeIcon class="text-fg-subtle" />
											)
										}
										title={said().title}
										detail={said().detail || undefined}
										action={
											<a href={props.changesHref} class={button({ size: "sm" })}>
												<EyeIcon size="sm" />
												Review changes
											</a>
										}
									/>
								)}
							</Show>

							<Show
								when={current().state === "OPEN"}
								fallback={
									<PullMergeBar
										ready
										title={current().state === "MERGED" ? "Merged" : "Closed"}
										detail={
											current().state === "MERGED"
												? `Into ${current().base}`
												: "Closed without merging"
										}
										actions={null}
									/>
								}
							>
								<PullMergeBar
									ready={!blocker()}
									title={blocker() ?? "Ready to merge"}
									detail={mergeLine(current(), history()?.ahead ?? null)}
									actions={
										<>
											<a href={props.changesHref} class={button({ size: "md" })}>
												Request changes
											</a>
											<Button
												size="md"
												variant="primary"
												disabled={busy() || Boolean(mergeBlocker(current()))}
												onClick={() => setMerging("squash")}
											>
												Squash and merge
											</Button>
										</>
									}
								/>
							</Show>
						</PullColumn>
					)}
				</Show>
			</div>

			<Dialog
				open={merging() !== null}
				onClose={() => setMerging(null)}
				title={MERGE_VERB[merging() ?? "squash"]}
				description={
					merging() === "squash" && pull() && !pull()?.fork
						? `#${props.number} into ${pull()?.base}, then its branch ${pull()?.branch} is deleted. This cannot be undone from Grid.`
						: `#${props.number} into ${pull()?.base ?? "its base"}. This cannot be undone from Grid.`
				}
				footer={
					<>
						<Button onClick={() => setMerging(null)}>Cancel</Button>
						<Button
							variant="primary"
							disabled={busy()}
							onClick={() => {
								const method = merging();
								if (!method) return;
								const remove = method === "squash" && !pull()?.fork;
								void act(
									(token) => pullsService.merge(token, props.project, props.number, method, remove),
									"Pull request merged",
								).then(() => setMerging(null));
							}}
						>
							{MERGE_VERB[merging() ?? "squash"]}
						</Button>
					</>
				}
			>
				<Text tone="subtle">{pull()?.title}</Text>
			</Dialog>
			<FixWithAgentSheet
				open={fixing()}
				project={props.project}
				number={props.number}
				onClose={() => setFixing(false)}
				onStarted={() => props.onChanged()}
			/>
		</div>
	);
}
