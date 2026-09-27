import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";

import {
	Alert,
	AlertIcon,
	Avatar,
	Badge,
	BranchIcon,
	Button,
	button,
	Card,
	CheckCircleIcon,
	ChevronDownIcon,
	DiffCard,
	DiffStat,
	Dialog,
	EmptyState,
	ExternalIcon,
	Heading,
	iconButton,
	Menu,
	type MenuGroup,
	MoreIcon,
	notify,
	PaneHeader,
	Prose,
	Skeleton,
	SpinnerIcon,
	Stack,
	Tabs,
	Text,
	Textarea,
} from "@/kit";
import { useAuth } from "@/modules/auth";
import { diffRows } from "@/modules/chat/lib/diff";
import { copyCodeFrom, renderMarkdown } from "@/modules/chat/lib/markdown";
import type { FileDiff } from "@/modules/chat/types/chat.types";
import { relativeTime } from "@/modules/projects/lib/relative-time";

import { CHECKS, mergeBlocker, reviewLabel, sortChecks, stateLabel } from "../lib/pulls";
import { pullsService } from "../services/pulls.service";
import type {
	Check,
	MergeMethod,
	PullAction,
	PullComment,
	PullDetail,
} from "../types/github.types";

type Section = "conversation" | "checks" | "files";

const MERGE_METHODS: { id: MergeMethod; label: string; verb: string }[] = [
	{ id: "squash", label: "Squash and merge", verb: "Squash and merge" },
	{ id: "merge", label: "Create a merge commit", verb: "Merge" },
	{ id: "rebase", label: "Rebase and merge", verb: "Rebase and merge" },
];

const REVIEW_WORDS: Record<string, string> = {
	APPROVED: "approved",
	CHANGES_REQUESTED: "requested changes",
	COMMENTED: "reviewed",
	DISMISSED: "had a review dismissed",
};

function message(cause: unknown, fallback: string): string {
	return cause instanceof Error ? cause.message : fallback;
}

/**
 * One pull request: what it is and where it stands (state, review, checks, branches), what can be
 * done with it (merge, ready or draft, close), and three sections: the conversation (its
 * description, reviews, comments and a box to add one), its checks, and its changed files.
 */
export function PullDetailPane(props: {
	project: string;
	number: number;
	onBack: () => void;
	/** Something changed on GitHub (merged, closed, made ready): the list reads again. */
	onChanged: () => void;
}): JSX.Element {
	const auth = useAuth();
	const [pull, setPull] = createSignal<PullDetail | null>(null);
	const [error, setError] = createSignal<string | null>(null);
	const [section, setSection] = createSignal<Section>("conversation");
	const [busy, setBusy] = createSignal(false);
	const [merging, setMerging] = createSignal<MergeMethod | null>(null);

	async function load(): Promise<void> {
		const token = auth.token();
		const { project, number } = props;
		if (!token) return;
		try {
			const next = await pullsService.view(token, project, number);
			if (project !== props.project || number !== props.number) return;
			setPull(next);
			setError(null);
		} catch (cause) {
			if (number !== props.number) return;
			setError(message(cause, "Could not open this pull request"));
		}
	}

	createEffect(
		() => [auth.token(), props.project, props.number] as const,
		() => {
			setPull(null);
			setError(null);
			setSection("conversation");
			void load();
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
			await load();
			props.onChanged();
			return true;
		} catch (cause) {
			notify({ title: message(cause, "GitHub did not do that"), tone: "danger" });
			return false;
		} finally {
			setBusy(false);
		}
	}

	const run = (action: PullAction, done: string) =>
		act((token) => pullsService.act(token, props.project, props.number, action), done);

	const moreGroups = (): MenuGroup[] => {
		const current = pull();
		if (!current || current.state !== "OPEN") return [];
		return [
			{
				items: [
					current.draft
						? { id: "ready", label: "Ready for review" }
						: { id: "draft", label: "Back to draft" },
					{ id: "close", label: "Close pull request", danger: true },
				],
			},
		];
	};

	return (
		<>
			<PaneHeader
				title={`Pull request #${props.number}`}
				onBack={props.onBack}
				backLabel="Pull requests"
				actions={
					<>
						<Show when={pull()}>
							{(current) => (
								<a
									href={current().url}
									target="_blank"
									rel="noopener noreferrer"
									aria-label="Open on GitHub"
									title="Open on GitHub"
									class={iconButton({ size: "sm" })}
								>
									<ExternalIcon size="sm" />
								</a>
							)}
						</Show>
						<Show when={moreGroups().length > 0}>
							<Menu
								label="More actions"
								trigger={<MoreIcon size="sm" />}
								triggerClass={iconButton({ size: "sm" })}
								placement="bottom-end"
								groups={moreGroups()}
								onSelect={(id) => {
									if (id === "ready") void run("ready", "Ready for review");
									else if (id === "draft") void run("draft", "Back to draft");
									else if (id === "close") void run("close", "Pull request closed");
								}}
							/>
						</Show>
					</>
				}
			/>
			<div class="min-h-0 flex-1 overflow-y-auto">
				<Show when={error()}>
					{(reason) => (
						<div class="flex flex-col gap-2 p-4">
							<Alert tone="danger" title={reason()} />
							<div>
								<Button size="sm" onClick={() => void load()}>
									Try again
								</Button>
							</div>
						</div>
					)}
				</Show>
				<Show when={pull()} fallback={<Show when={!error()}>{<DetailSkeleton />}</Show>}>
					{(current) => (
						<div class="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-5 md:px-6">
							<Overview pull={current()} />
							<Show when={current().state === "OPEN"}>
								<MergeBox pull={current()} busy={busy()} onMerge={(method) => setMerging(method)} />
							</Show>
							<Tabs
								label="Pull request sections"
								class="border-line border-b"
								value={section()}
								onChange={setSection}
								options={[
									{
										value: "conversation",
										label: "Conversation",
										count: current().conversation.length,
										countTone: "quiet",
									},
									{
										value: "checks",
										label: "Checks",
										count: current().checkList.length,
										countTone: "quiet",
									},
									{
										value: "files",
										label: "Files",
										count: current().files.length,
										countTone: "quiet",
									},
								]}
							/>
							<Show when={section() === "conversation"}>
								<Conversation
									pull={current()}
									busy={busy()}
									onComment={(body) =>
										act(
											(token) => pullsService.comment(token, props.project, props.number, body),
											"Comment added",
										)
									}
								/>
							</Show>
							<Show when={section() === "checks"}>
								<Checks checks={current().checkList} />
							</Show>
							<Show when={section() === "files"}>
								<Files project={props.project} number={props.number} />
							</Show>
						</div>
					)}
				</Show>
			</div>
			<Dialog
				open={merging() !== null}
				onClose={() => setMerging(null)}
				title={MERGE_METHODS.find((method) => method.id === merging())?.verb ?? "Merge"}
				description={`#${props.number} into ${pull()?.base ?? "its base"}. This cannot be undone from Grid.`}
				footer={
					<>
						<Button onClick={() => setMerging(null)}>Cancel</Button>
						<Button
							variant="primary"
							disabled={busy()}
							onClick={() => {
								const method = merging();
								if (!method) return;
								void act(
									(token) => pullsService.merge(token, props.project, props.number, method),
									"Pull request merged",
								).then(() => setMerging(null));
							}}
						>
							{MERGE_METHODS.find((method) => method.id === merging())?.verb ?? "Merge"}
						</Button>
					</>
				}
			>
				<Text tone="subtle">{pull()?.title}</Text>
			</Dialog>
		</>
	);
}

function DetailSkeleton(): JSX.Element {
	return (
		<div class="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-5 md:px-6">
			<Skeleton class="h-7 w-2/3" />
			<Skeleton class="h-5 w-1/2" />
			<Skeleton class="h-24" />
		</div>
	);
}

/** The title, and every fact about where it stands on one wrapping line of badges. */
function Overview(props: { pull: PullDetail }): JSX.Element {
	const state = () => stateLabel(props.pull);
	const review = () => reviewLabel(props.pull.review);
	const checks = () => CHECKS[props.pull.checks];
	return (
		<Stack gap={3}>
			<Heading level={3}>{props.pull.title}</Heading>
			<div class="flex flex-wrap items-center gap-1.5">
				<Badge tone={state().tone} dot>
					{state().label}
				</Badge>
				<Show when={review()}>{(shown) => <Badge tone={shown().tone}>{shown().label}</Badge>}</Show>
				<Show when={checks()}>{(shown) => <Badge tone={shown().tone}>{shown().label}</Badge>}</Show>
				<For each={props.pull.labels}>{(label) => <Badge>{label}</Badge>}</For>
			</div>
			<div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
				<span class="flex min-w-0 items-center gap-1.5">
					<BranchIcon size="sm" class="text-fg-subtle" />
					<Text as="span" size="caption" tone="subtle" mono truncate>
						{props.pull.branch} → {props.pull.base}
					</Text>
				</span>
				<DiffStat added={props.pull.additions} removed={props.pull.deletions} />
				<Text as="span" size="caption" tone="subtle">
					@{props.pull.author} · opened {relativeTime(props.pull.createdAt)}
				</Text>
			</div>
		</Stack>
	);
}

/** Merge, with its method picked from the button's menu, or what merging waits for. */
function MergeBox(props: {
	pull: PullDetail;
	busy: boolean;
	onMerge: (method: MergeMethod) => void;
}): JSX.Element {
	const blocker = () => mergeBlocker(props.pull);
	return (
		<Card padding="md" class="flex flex-col gap-3 md:flex-row md:items-center">
			<div class="min-w-0 flex-1">
				<Text weight="medium">{blocker() ? "Not ready to merge" : "Ready to merge"}</Text>
				<Text size="caption" tone="subtle">
					{blocker() ??
						(props.pull.checks === "failing"
							? "Some checks fail; GitHub may still allow merging."
							: props.pull.mergeable === "UNKNOWN"
								? "GitHub is still checking for conflicts."
								: "No conflicts with the base branch.")}
				</Text>
			</div>
			<Show when={!blocker()}>
				<Menu
					label="Merge"
					trigger={
						<>
							Merge
							<ChevronDownIcon size="sm" />
						</>
					}
					triggerClass={button({ variant: "primary", size: "sm" })}
					placement="bottom-end"
					groups={[{ items: MERGE_METHODS.map(({ id, label }) => ({ id, label })) }]}
					onSelect={(id) => props.onMerge(id as MergeMethod)}
				/>
			</Show>
		</Card>
	);
}

/** The description, then reviews and comments in time order, then a box to add a comment. */
function Conversation(props: {
	pull: PullDetail;
	busy: boolean;
	onComment: (body: string) => Promise<boolean>;
}): JSX.Element {
	const [draft, setDraft] = createSignal("");
	const body = createMemo(() => renderMarkdown(props.pull.body || "_No description._"));
	async function send(): Promise<void> {
		const text = draft().trim();
		if (!text) return;
		if (await props.onComment(text)) setDraft("");
	}
	return (
		<Stack gap={4}>
			<Entry author={props.pull.author} at={props.pull.createdAt} note="opened this">
				<Prose html={body()} onClick={copyCodeFrom} />
			</Entry>
			<For each={props.pull.conversation}>{(comment) => <CommentEntry comment={comment} />}</For>
			<Show when={props.pull.state === "OPEN"}>
				<Stack gap={2}>
					<Textarea
						aria-label="Comment"
						placeholder="Leave a comment (Markdown)"
						rows={3}
						value={draft()}
						onInput={(event) => setDraft(event.currentTarget.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
								event.preventDefault();
								void send();
							}
						}}
					/>
					<div class="flex justify-end">
						<Button
							variant="primary"
							size="sm"
							disabled={props.busy || !draft().trim()}
							onClick={() => void send()}
						>
							Comment
						</Button>
					</div>
				</Stack>
			</Show>
		</Stack>
	);
}

function CommentEntry(props: { comment: PullComment }): JSX.Element {
	const html = createMemo(() =>
		props.comment.body.trim() ? renderMarkdown(props.comment.body) : "",
	);
	const note = () => (props.comment.review ? REVIEW_WORDS[props.comment.review] : undefined);
	return (
		<Entry author={props.comment.author} at={props.comment.at} note={note()}>
			<Show when={html()}>
				<Prose html={html()} onClick={copyCodeFrom} />
			</Show>
		</Entry>
	);
}

/** Someone's part in the conversation: who, what they did and when, then what they wrote. */
function Entry(props: {
	author: string;
	at: string;
	note?: string;
	children: JSX.Element;
}): JSX.Element {
	return (
		<article class="flex min-w-0 gap-3">
			<Avatar name={props.author} size="sm" />
			<div class="flex min-w-0 flex-1 flex-col gap-1">
				<Text size="caption" tone="subtle">
					<Text as="span" size="caption" weight="medium" tone="strong">
						@{props.author}
					</Text>
					{props.note ? ` ${props.note}` : ""} · {relativeTime(props.at)}
				</Text>
				{props.children}
			</div>
		</article>
	);
}

/** One check's state as an icon. */
function CheckMark(props: { state: Check["state"] }): JSX.Element {
	return (
		<Show when={props.state !== "pending"} fallback={<SpinnerIcon class="size-4 text-warning" />}>
			<Show
				when={props.state === "failure"}
				fallback={
					<CheckCircleIcon
						size="sm"
						class={props.state === "success" ? "text-success" : "text-fg-faint"}
					/>
				}
			>
				<AlertIcon size="sm" class="text-danger" />
			</Show>
		</Show>
	);
}

/** Every check, failing ones first, each linking to its run. */
function Checks(props: { checks: Check[] }): JSX.Element {
	const sorted = createMemo(() => sortChecks(props.checks));
	return (
		<Show
			when={sorted().length > 0}
			fallback={<EmptyState title="No checks" description="Nothing runs on this pull request." />}
		>
			<ul class="flex flex-col divide-y divide-line">
				<For each={sorted()}>
					{(check) => (
						<li class="flex min-w-0 items-center gap-2.5 py-2.5">
							<CheckMark state={check.state} />
							<div class="min-w-0 flex-1">
								<Text truncate>{check.name}</Text>
								<Show when={check.workflow}>
									<Text size="caption" tone="subtle" truncate>
										{check.workflow}
									</Text>
								</Show>
							</div>
							<Show when={check.url}>
								{(url) => (
									<a
										href={url()}
										target="_blank"
										rel="noopener noreferrer"
										aria-label={`Open ${check.name}`}
										title="Open the run"
										class={iconButton({ size: "sm" })}
									>
										<ExternalIcon size="sm" />
									</a>
								)}
							</Show>
						</li>
					)}
				</For>
			</ul>
		</Show>
	);
}

/** The changed files, read when the section is first opened. */
function Files(props: { project: string; number: number }): JSX.Element {
	const auth = useAuth();
	const [files, setFiles] = createSignal<FileDiff[] | null>(null);
	const [error, setError] = createSignal<string | null>(null);
	createEffect(
		() => [auth.token(), props.project, props.number] as const,
		([token, project, number]) => {
			if (!token) return;
			setFiles(null);
			setError(null);
			pullsService
				.diff(token, project, number)
				.then((next) => {
					if (number === props.number) setFiles(next);
				})
				.catch((cause) => setError(message(cause, "Could not read the changes")));
		},
	);
	return (
		<Show when={!error()} fallback={<Alert tone="danger" title={error() ?? ""} />}>
			<Show when={files()} fallback={<DetailSkeleton />}>
				{(loaded) => (
					<Show when={loaded().length > 0} fallback={<EmptyState title="No changed files" />}>
						<Stack gap={3}>
							<For each={loaded()}>
								{(file) => (
									<DiffCard
										path={file.path}
										added={file.added}
										removed={file.removed}
										lines={diffRows(file)}
									/>
								)}
							</For>
						</Stack>
					</Show>
				)}
			</Show>
		</Show>
	);
}
