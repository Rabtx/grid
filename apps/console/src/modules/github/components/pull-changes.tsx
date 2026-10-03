import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, createSignal, For, Show, untrack } from "solid-js";

import {
	AgentLogo,
	Alert,
	Avatar,
	BackIcon,
	Button,
	button,
	Checkbox,
	CheckIcon,
	ChevronDownIcon,
	type DiffLine,
	EntryIcon,
	ExternalIcon,
	IconButton,
	iconButton,
	Menu,
	MoreIcon,
	notify,
	Prose,
	ReviewBar,
	ReviewComment,
	ReviewCommentBox,
	ReviewConversationRow,
	ReviewDiffFile,
	ReviewFileRow,
	ReviewProgress,
	ReviewSuggestion,
	ReviewThreadBlock,
	Segmented,
	Skeleton,
	Stack,
	Text,
} from "@/kit";
import { localStore } from "@/lib/local-store";
import { useAuth } from "@/modules/auth";
import { diffRows } from "@/modules/chat/lib/diff";
import { renderMarkdown } from "@/modules/chat/lib/markdown";
import { agentName } from "@/modules/chat/stores/providers";
import type { FileDiff } from "@/modules/chat/types/chat.types";
import { placementsStore } from "@/modules/environments";
import { relativeTime } from "@/modules/projects/lib/relative-time";
import { ShellSlot, useShell } from "@/modules/shell";

import { commentParts, hideWhitespace, splitRows } from "../lib/pull-look";
import { pullsService } from "../services/pulls.service";
import type {
	DraftComment,
	PullDetail,
	PullReview,
	ReviewEvent,
	ReviewThread,
} from "../types/github.types";

type Mode = "unified" | "split";
type Where = { path: string; side: "LEFT" | "RIGHT"; line: number };

const EVENTS = [
	{ value: "APPROVE", label: "Approve" },
	{ value: "COMMENT", label: "Comment" },
	{ value: "REQUEST_CHANGES", label: "Request changes" },
] as const satisfies readonly { value: ReviewEvent; label: string }[];

function message(cause: unknown, fallback: string): string {
	return cause instanceof Error ? cause.message : fallback;
}

const draftsKey = (project: string, number: number) => `pull-review:${project}:${number}`;
const fileId = (path: string) => `review-file-${path.replace(/[^\w-]/g, "-")}`;

/**
 * A pull request's changes as a reviewer reads them (Figma 18 · Pull request · Changes): its files
 * (viewed or not) and conversations beside the diff, unified or side by side, whitespace hidden or
 * not; each thread under the line it hangs on, comments written on lines and kept as a draft on
 * this device until the review is submitted with its verdict.
 */
export function PullChanges(props: {
	project: string;
	number: number;
	onBack: () => void;
	onChanged: () => void;
}): JSX.Element {
	const auth = useAuth();
	const shell = useShell();
	const scope = () => placementsStore.scopeOf(props.project);
	const nameOf = (agent: string) => agentName(agent, scope());
	const [pull, setPull] = createSignal<PullDetail | null>(null);
	const [files, setFiles] = createSignal<FileDiff[] | null>(null);
	const [review, setReview] = createSignal<PullReview | null>(null);
	const [error, setError] = createSignal<string | null>(null);
	const [mode, setMode] = createSignal<Mode>("unified");
	const [quiet, setQuiet] = createSignal(true);
	const [folded, setFolded] = createSignal<Set<string>>(new Set());
	const [drafts, setDrafts] = createSignal<DraftComment[]>([]);
	const [writing, setWriting] = createSignal<(Where & { text: string }) | null>(null);
	const [verdict, setVerdict] = createSignal<ReviewEvent>("APPROVE");
	const [busy, setBusy] = createSignal(false);
	const [current, setCurrent] = createSignal<string | null>(null);

	function load(): void {
		const token = auth.token();
		const { project, number } = props;
		if (!token) return;
		const still = () =>
			project === untrack(() => props.project) && number === untrack(() => props.number);
		Promise.all([
			pullsService.view(token, project, number),
			pullsService.diff(token, project, number),
		]).then(
			([next, diff]) => {
				if (!still()) return;
				setPull(next);
				setFiles(diff);
				setError(null);
			},
			(cause) => {
				if (still()) setError(message(cause, "Could not read the changes"));
			},
		);
		pullsService.review(token, project, number).then(
			(next) => {
				if (still()) setReview(next);
			},
			() => undefined,
		);
		void localStore.get<DraftComment[]>(draftsKey(project, number)).then((kept) => {
			if (still()) setDrafts(kept ?? []);
		});
	}

	createEffect(
		() => [auth.token(), props.project, props.number] as const,
		() => {
			setPull(null);
			setFiles(null);
			setReview(null);
			setError(null);
			setWriting(null);
			load();
		},
	);

	function keepDrafts(next: DraftComment[]): void {
		setDrafts(next);
		void localStore.set(draftsKey(props.project, props.number), next);
	}

	/** Each file's lines as the reviewer reads them now: highlighted, whitespace hidden or not. */
	const lines = createMemo(() => {
		const all = new Map<string, DiffLine[]>();
		for (const file of files() ?? []) {
			const rows = diffRows(file) as DiffLine[];
			all.set(file.path, quiet() ? hideWhitespace(rows) : rows);
		}
		return all;
	});
	const viewed = () => new Set(review()?.viewed ?? []);
	const total = () => files()?.length ?? 0;
	const viewedCount = () => (files() ?? []).filter((file) => viewed().has(file.path)).length;
	const threadsOf = (path: string) =>
		(review()?.threads ?? []).filter((thread) => thread.path === path);
	const comments = () => (review()?.threads.length ?? 0) + drafts().length;

	/** The text of a line in the new (or old) file, for showing what a suggestion replaces. */
	function lineText(path: string, side: "LEFT" | "RIGHT", line: number): string | null {
		for (const row of lines().get(path) ?? []) {
			if (row.kind === "hunk") continue;
			if (side === "RIGHT" && row.kind !== "del" && row.new === line) return row.text ?? "";
			if (side === "LEFT" && row.kind !== "add" && row.old === line) return row.text ?? "";
		}
		return null;
	}

	async function setFileViewed(path: string, on: boolean): Promise<void> {
		const token = auth.token();
		const shown = review();
		if (!token || !shown) return;
		const before = shown.viewed;
		setReview({
			...shown,
			viewed: on ? [...before, path] : before.filter((item) => item !== path),
		});
		if (on) setFolded((all) => new Set([...all, path]));
		try {
			await pullsService.setViewed(token, props.project, props.number, path, on);
		} catch (cause) {
			setReview((now) => (now ? { ...now, viewed: before } : now));
			notify({ title: message(cause, "GitHub did not mark it"), tone: "danger" });
		}
	}

	function saveWriting(): void {
		const draft = writing();
		if (!draft || !draft.text.trim()) return;
		keepDrafts([
			...drafts(),
			{
				id: crypto.randomUUID(),
				path: draft.path,
				side: draft.side,
				line: draft.line,
				body: draft.text.trim(),
			},
		]);
		setWriting(null);
	}

	async function submit(event: ReviewEvent): Promise<void> {
		const token = auth.token();
		if (!token || busy()) return;
		setBusy(true);
		try {
			await pullsService.submitReview(token, props.project, props.number, {
				event,
				body: "",
				comments: drafts(),
			});
			keepDrafts([]);
			notify({
				title:
					event === "APPROVE"
						? "Approved"
						: event === "REQUEST_CHANGES"
							? "Changes requested"
							: "Review sent",
				tone: "success",
			});
			props.onChanged();
			load();
		} catch (cause) {
			notify({ title: message(cause, "GitHub did not take the review"), tone: "danger" });
		} finally {
			setBusy(false);
		}
	}

	function jumpTo(path: string): void {
		setCurrent(path);
		setFolded((all) => {
			const next = new Set(all);
			next.delete(path);
			return next;
		});
		requestAnimationFrame(() =>
			document.getElementById(fileId(path))?.scrollIntoView({ behavior: "smooth", block: "start" }),
		);
	}
	/** The next (or previous) file with a conversation, from the one in view. */
	function stepThreads(direction: 1 | -1): void {
		const withTalk = (files() ?? [])
			.map((file) => file.path)
			.filter((path) => threadsOf(path).length || drafts().some((draft) => draft.path === path));
		if (!withTalk.length) return;
		const at = withTalk.indexOf(current() ?? "");
		jumpTo(withTalk[(at + direction + withTalk.length) % withTalk.length]);
	}

	const thread = (shown: ReviewThread) => (
		<ReviewThreadBlock>
			<For each={shown.comments}>
				{(comment, index) => (
					<ReviewComment
						mark={
							comment.agent ? (
								<AgentLogo id={comment.agent} name={nameOf(comment.agent)} />
							) : (
								<Avatar name={comment.author} size="xs" />
							)
						}
						who={comment.agent ? nameOf(comment.agent) : comment.author}
						kind={comment.agent ? comment.author : undefined}
						when={comment.at ? relativeTime(comment.at) : ""}
						resolved={index() === 0 && shown.resolved}
					>
						<For each={commentParts(comment.body)}>
							{(part) =>
								part.kind === "text" ? (
									<Prose html={renderMarkdown(part.text)} />
								) : (
									<ReviewSuggestion
										before={
											shown.line !== null
												? [lineText(shown.path, shown.side, shown.line) ?? ""].filter(Boolean)
												: []
										}
										after={part.lines}
									/>
								)
							}
						</For>
					</ReviewComment>
				)}
			</For>
		</ReviewThreadBlock>
	);

	/** What hangs under a line of a file: its threads, its drafts, and a comment being written. */
	const under = (path: string) => (side: "LEFT" | "RIGHT", line: number) => {
		const here = threadsOf(path).filter((item) => item.side === side && item.line === line);
		const mine = drafts().filter(
			(draft) => draft.path === path && draft.side === side && draft.line === line,
		);
		const typing = writing();
		const open = typing && typing.path === path && typing.side === side && typing.line === line;
		if (!here.length && !mine.length && !open) return null;
		return (
			<>
				<For each={here}>{(item) => thread(item)}</For>
				<Show when={mine.length || open}>
					<ReviewThreadBlock>
						<For each={mine}>
							{(draft) => (
								<ReviewComment
									mark={<Avatar name={review()?.viewer || "You"} size="xs" />}
									who="You"
									kind="draft"
									when=""
								>
									<Prose html={renderMarkdown(draft.body)} />
									<button
										type="button"
										onClick={() => keepDrafts(drafts().filter((item) => item.id !== draft.id))}
										class="self-start text-caption text-fg-subtle hover:text-fg"
									>
										Discard
									</button>
								</ReviewComment>
							)}
						</For>
						<Show when={open ? typing : null}>
							{(draft) => (
								<ReviewCommentBox
									value={draft().text}
									onInput={(text) => setWriting({ ...draft(), text })}
									onCancel={() => setWriting(null)}
									onSave={saveWriting}
								/>
							)}
						</Show>
					</ReviewThreadBlock>
				</Show>
			</>
		);
	};

	/** The files as a tree: each folder once, its files under it. */
	const tree = createMemo(() => {
		const folders = new Map<string, FileDiff[]>();
		for (const file of files() ?? []) {
			const folder = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : "";
			folders.set(folder, [...(folders.get(folder) ?? []), file]);
		}
		return [...folders.entries()];
	});
	const conversations = createMemo(() => [
		...(review()?.threads ?? []).map((item) => ({
			key: item.id,
			resolved: item.resolved,
			title:
				(item.comments[0]?.body ?? "")
					.replace(/```[\s\S]*?```/g, "")
					.split("\n")[0]
					?.trim() || "Suggested change",
			detail: `${item.path.split("/").pop()}${item.line ? ` · line ${item.line}` : ""} · ${item.resolved ? "resolved" : "open"}`,
			path: item.path,
		})),
		...drafts().map((draft) => ({
			key: draft.id,
			resolved: false,
			title: draft.body.split("\n")[0] ?? "",
			detail: `${draft.path.split("/").pop()} · line ${draft.line} · your draft`,
			path: draft.path,
		})),
	]);

	const reviewLine = () =>
		[
			drafts().length
				? `${drafts().length} draft comment${drafts().length === 1 ? "" : "s"}`
				: null,
			`${viewedCount()} of ${total()} file${total() === 1 ? "" : "s"} viewed`,
		]
			.filter(Boolean)
			.join(" · ");
	const canReview = () =>
		pull()?.state === "OPEN" && review() !== null && review()?.viewer !== pull()?.author;

	return (
		<div class="flex min-h-0 flex-1 flex-col">
			<ShellSlot name="crumb">#{props.number} / Review changes</ShellSlot>
			<ShellSlot name="actions">
				<Show when={pull()}>
					{(shown) => (
						<a
							href={`${shown().url}/files`}
							target="_blank"
							rel="noopener noreferrer"
							class={button({ size: "sm", variant: "ghost" })}
						>
							<ExternalIcon size="sm" />
							Open on GitHub
						</a>
					)}
				</Show>
			</ShellSlot>
			<ShellSlot name="heading">
				<div class="flex min-w-0 flex-col items-center">
					<Text as="h1" tone="strong" weight="medium" size="body-lg" truncate>
						Review changes
					</Text>
					<Text size="caption" tone="subtle" truncate>
						#{props.number} · {viewedCount()} of {total()} viewed
					</Text>
				</div>
			</ShellSlot>
			<ShellSlot name="leading">
				<IconButton
					label="Back to the pull request"
					variant="secondary"
					shape="round"
					size="lg"
					onClick={props.onBack}
				>
					<BackIcon />
				</IconButton>
			</ShellSlot>
			<ShellSlot name="trailing">
				<Menu
					label="View"
					title="View"
					trigger={<MoreIcon />}
					triggerClass={iconButton({ size: "lg", shape: "round", variant: "secondary" })}
					placement="bottom-end"
					groups={[
						{
							items: [
								{
									id: "unified",
									label: "Unified",
									trailing: mode() === "unified" ? <CheckIcon /> : undefined,
								},
								{
									id: "split",
									label: "Side by side",
									trailing: mode() === "split" ? <CheckIcon /> : undefined,
								},
								{ id: "space", label: quiet() ? "Show whitespace" : "Hide whitespace" },
							],
						},
					]}
					onSelect={(id) => {
						if (id === "unified" || id === "split") setMode(id);
						else setQuiet((on) => !on);
					}}
				/>
			</ShellSlot>

			<div class="flex min-h-0 flex-1">
				{/* Desktop: the files and the conversations beside the diff. */}
				<aside class="hidden w-60 shrink-0 flex-col gap-4 overflow-y-auto border-line border-r p-2 md:flex">
					<div class="flex flex-col gap-2 px-2 pt-2">
						<div class="flex items-center justify-between text-caption text-fg-subtle">
							<span>Files</span>
							<span>
								{viewedCount()} of {total()} viewed
							</span>
						</div>
						<ReviewProgress done={viewedCount()} total={total()} />
					</div>
					<div class="flex flex-col">
						<For each={tree()}>
							{([folder, list]) => (
								<>
									<Show when={folder}>
										<div class="flex h-kit-row min-w-0 items-center gap-2 px-2 text-nav text-fg">
											<ChevronDownIcon class="size-3.5 shrink-0 text-fg-faint" />
											<EntryIcon name={folder.split("/").pop() ?? folder} folder open />
											<span class="truncate">{folder}</span>
										</div>
									</Show>
									<For each={list}>
										{(file) => (
											<ReviewFileRow
												icon={
													<EntryIcon
														name={file.path.split("/").pop() ?? file.path}
														folder={false}
													/>
												}
												name={file.path.split("/").pop() ?? file.path}
												depth={folder ? 1 : 0}
												comments={
													threadsOf(file.path).length +
													drafts().filter((draft) => draft.path === file.path).length
												}
												viewed={viewed().has(file.path)}
												current={current() === file.path}
												onClick={() => jumpTo(file.path)}
											/>
										)}
									</For>
								</>
							)}
						</For>
					</div>
					<Show when={conversations().length}>
						<div class="flex flex-col">
							<span class="px-2 pb-1 text-caption text-fg-subtle">Conversations</span>
							<For each={conversations()}>
								{(item) => (
									<ReviewConversationRow
										resolved={item.resolved}
										title={item.title}
										detail={item.detail}
										onClick={() => jumpTo(item.path)}
									/>
								)}
							</For>
						</div>
					</Show>
				</aside>

				<div class="flex min-h-0 min-w-0 flex-1 flex-col">
					<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-0 pt-0 pb-4 md:px-6 md:pt-4">
						<Show when={error()}>
							{(reason) => (
								<div class="p-4">
									<Alert tone="danger" title={reason()} />
								</div>
							)}
						</Show>
						<div class="hidden items-center gap-3 pb-3 md:flex">
							<Segmented<Mode>
								size="sm"
								label="Diff view"
								value={mode()}
								onChange={setMode}
								options={[
									{ value: "unified", label: "Unified" },
									{ value: "split", label: "Split" },
								]}
							/>
							<span class="flex items-center gap-1.5 text-caption text-fg-muted">
								<Checkbox label="Hide whitespace" checked={quiet()} onChange={setQuiet} />
								<span aria-hidden="true">Hide whitespace</span>
							</span>
							<span class="flex-1" />
							<Show when={comments()}>
								<span class="text-caption text-fg-subtle">
									{comments()} comment{comments() === 1 ? "" : "s"}
								</span>
								<IconButton size="sm" label="Previous conversation" onClick={() => stepThreads(-1)}>
									<ChevronDownIcon class="rotate-180" />
								</IconButton>
								<IconButton size="sm" label="Next conversation" onClick={() => stepThreads(1)}>
									<ChevronDownIcon />
								</IconButton>
							</Show>
						</div>
						<Show
							when={files()}
							fallback={
								<Show when={!error()}>
									<Stack gap={3} class="p-4 md:p-0">
										<Skeleton class="h-40" />
										<Skeleton class="h-24" />
									</Stack>
								</Show>
							}
						>
							{(list) => (
								<Stack gap={3}>
									<For each={list()}>
										{(file) => (
											<div id={fileId(file.path)} class="scroll-mt-4">
												<ReviewDiffFile
													icon={
														<EntryIcon
															name={file.path.split("/").pop() ?? file.path}
															folder={false}
														/>
													}
													path={
														shell.desktop() ? file.path : (file.path.split("/").pop() ?? file.path)
													}
													added={file.added}
													removed={file.removed}
													lines={lines().get(file.path) ?? []}
													split={
														mode() === "split" && shell.desktop()
															? splitRows(lines().get(file.path) ?? [])
															: undefined
													}
													open={!folded().has(file.path)}
													onToggle={() =>
														setFolded((all) => {
															const next = new Set(all);
															if (next.has(file.path)) next.delete(file.path);
															else next.add(file.path);
															return next;
														})
													}
													viewed={viewed().has(file.path)}
													onViewed={(on) => void setFileViewed(file.path, on)}
													under={under(file.path)}
													onComment={
														canReview()
															? (side, line) =>
																	setWriting({ path: file.path, side, line, text: "" })
															: undefined
													}
												/>
											</div>
										)}
									</For>
								</Stack>
							)}
						</Show>
					</div>
					<Show when={canReview()}>
						<div class="shrink-0 px-3 pb-3 md:px-6">
							<Show
								when={shell.desktop()}
								fallback={
									<div class="flex gap-2 pb-safe">
										<Button
											size="xl"
											class="flex-1"
											disabled={busy()}
											onClick={() => void submit("REQUEST_CHANGES")}
										>
											Request changes
										</Button>
										<Button
											size="xl"
											variant="primary"
											class="flex-1"
											disabled={busy()}
											onClick={() => void submit("APPROVE")}
										>
											Approve
										</Button>
									</div>
								}
							>
								<ReviewBar title="Your review" detail={reviewLine()}>
									<Segmented<ReviewEvent>
										label="Your verdict"
										value={verdict()}
										onChange={setVerdict}
										options={EVENTS}
									/>
									<Button
										variant="primary"
										disabled={busy()}
										onClick={() => void submit(verdict())}
									>
										Submit review
									</Button>
								</ReviewBar>
							</Show>
						</div>
					</Show>
				</div>
			</div>
		</div>
	);
}
