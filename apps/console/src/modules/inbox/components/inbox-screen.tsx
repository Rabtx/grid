import { useNavigate, useSearchParams } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, createSignal, For, onSettled, Show } from "solid-js";

import {
	Alert,
	AlertIcon,
	BellIcon,
	Button,
	ChatIcon,
	CheckIcon,
	CloseIcon,
	EmptyState,
	ExternalIcon,
	type FeedTone,
	FeedGroup,
	FeedRow,
	IconButton,
	InboxIcon,
	Kbd,
	NavLink,
	NavSection,
	FolderIcon,
	InfoStrip,
	PullRequestIcon,
	RestoreIcon,
	Segmented,
	ShieldIcon,
	Skeleton,
	SpinnerIcon,
	Text,
	ToneTile,
} from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";
import { now as clockNow } from "@/lib/clock";
import { installShortcuts } from "@/lib/shortcuts";
import { useAuth } from "@/modules/auth";
import { relativeTime } from "@/modules/projects/lib/relative-time";
import { ShellSlot, useShell } from "@/modules/shell";

import { inboxStore } from "../stores/inbox";
import type { InboxItem, InboxKind } from "../types/inbox.types";

/** How each kind reads: its tinted glyph, what it is waiting on, and where it opens. */
const KINDS: Record<
	InboxKind,
	{ tone: FeedTone; icon: () => JSX.Element; state: string; open: string }
> = {
	approval: {
		tone: "violet",
		icon: () => <ShieldIcon />,
		state: "Waiting for your approval",
		open: "Open thread",
	},
	turn_done: {
		tone: "success",
		icon: () => <CheckIcon />,
		state: "Finished while you were away",
		open: "Open thread",
	},
	turn_error: {
		tone: "danger",
		icon: () => <CloseIcon />,
		state: "The run failed",
		open: "Open thread",
	},
	pull_review: {
		tone: "accent",
		icon: () => <PullRequestIcon />,
		state: "Wants your review",
		open: "Open pull request",
	},
	pull_checks: {
		tone: "danger",
		icon: () => <AlertIcon />,
		state: "Checks are failing",
		open: "Open pull request",
	},
};

type View = "needs" | "all" | "done";

const VIEWS: { value: View; label: string; icon: () => JSX.Element }[] = [
	{ value: "needs", label: "Needs you", icon: () => <BellIcon /> },
	{ value: "all", label: "All activity", icon: () => <ChatIcon /> },
	{ value: "done", label: "Done", icon: () => <CheckIcon /> },
];

function inView(item: InboxItem, view: View): boolean {
	if (view === "needs") return item.readAt === null;
	if (view === "done") return item.readAt !== null;
	return true;
}

/** "Today", "Yesterday" or "Earlier", by the device's calendar (daylight saving included). */
export function dayGroup(iso: string, now = clockNow()): string {
	const today = new Date(now);
	today.setHours(0, 0, 0, 0);
	const yesterday = new Date(today);
	yesterday.setDate(today.getDate() - 1);
	const at = Date.parse(iso);
	if (Number.isNaN(at)) return "Earlier";
	if (at >= today.getTime()) return "Today";
	if (at >= yesterday.getTime()) return "Yesterday";
	return "Earlier";
}

const GROUPS = ["Today", "Yesterday", "Earlier"] as const;

function needLabel(unread: number): string {
	return unread === 0 ? "Nothing waiting" : `${unread} need${unread === 1 ? "s" : ""} you`;
}

/**
 * The Inbox (the Figma Inbox frames): everything waiting on you across every project — an agent
 * asking for approval, a turn that finished or failed while nobody was looking, and, with GitHub
 * connected, pull requests wanting a review or failing checks. The panel picks a view (Needs you,
 * All activity, Done) or a project; desktop lists the items beside the one you are looking at,
 * phones list them and open each where it lives.
 */
export function InboxScreen(): JSX.Element {
	const auth = useAuth();
	const shell = useShell();
	const navigate = useNavigate();
	const [search, setSearch] = useSearchParams<{ view?: string; project?: string }>();
	const [revision, setRevision] = createSignal(0);
	const [selectedId, setSelectedId] = createSignal<string | null>(null);

	const view = (): View =>
		search.view === "all" || search.view === "done" ? search.view : "needs";
	const project = () => search.project ?? null;

	// Arriving reads the inbox; only the page's own Refresh asks GitHub again.
	createEffect(
		() => [auth.token(), revision()] as const,
		([token]) => {
			if (token) void inboxStore.load(token);
		},
	);

	const shown = createMemo(() =>
		inboxStore
			.items()
			.filter((item) => inView(item, view()) && (!project() || item.project === project())),
	);
	const countIn = (v: View) => inboxStore.items().filter((item) => inView(item, v)).length;
	const projects = createMemo(() => {
		const counts = new Map<string, number>();
		for (const item of inboxStore.items()) {
			if (item.readAt === null) counts.set(item.project, (counts.get(item.project) ?? 0) + 1);
			else if (!counts.has(item.project)) counts.set(item.project, 0);
		}
		return [...counts.entries()].map(([slug, unread]) => ({ slug, unread }));
	});
	// The one on show beside the list: the one picked, or the first, while it is still listed.
	const selected = createMemo(
		() => shown().find((item) => item.id === selectedId()) ?? shown()[0] ?? null,
	);

	function refresh(): void {
		const token = auth.token();
		if (token) void inboxStore.load(token, true);
		else setRevision((n) => n + 1);
	}

	function open(item: InboxItem): void {
		const token = auth.token();
		if (token) void inboxStore.open(token, item);
		navigate(workspaceHref(item.url));
	}

	// Each day's rows, by label, so a change re-renders the rows that changed, not every group.
	const byDay = createMemo(() => {
		const days = new Map<string, InboxItem[]>();
		for (const item of shown()) {
			const label = dayGroup(item.createdAt);
			days.set(label, [...(days.get(label) ?? []), item]);
		}
		return days;
	});
	const days = createMemo(() => GROUPS.filter((label) => byDay().has(label)));

	function markDone(item: InboxItem): void {
		// In Needs you the item leaves the list: the one after it (or before, at the end) is next.
		if (view() === "needs") {
			const list = shown();
			const at = list.findIndex((row) => row.id === item.id);
			const next = list[at + 1] ?? list[at - 1];
			if (next) setSelectedId(next.id);
		}
		const token = auth.token();
		if (token) void inboxStore.readItem(token, item.id);
	}

	function step(by: number): void {
		const list = shown();
		const at = list.findIndex((item) => item.id === selected()?.id);
		const next = list[Math.min(list.length - 1, Math.max(0, at + by))];
		if (!next) return;
		setSelectedId(next.id);
		const row = document.querySelector<HTMLElement>(`[data-feed-id="${CSS.escape(next.id)}"]`);
		row?.focus();
		row?.scrollIntoView({ block: "nearest" });
	}

	// The list's keys act only on the Inbox in view: not under the palette or the drawer.
	const keysLive = () => shell.desktop() && !shell.paletteOpen() && !shell.drawerOpen();

	// Desktop keys, as the Figma list's footer shows them: E done, J and K next and previous.
	onSettled(() =>
		installShortcuts(
			[
				{ keys: "j", label: "Next item", run: () => keysLive() && step(1) },
				{ keys: "k", label: "Previous item", run: () => keysLive() && step(-1) },
				{
					keys: "e",
					label: "Mark done",
					run: () => {
						const item = selected();
						if (keysLive() && item) markDone(item);
					},
				},
			],
			document,
		),
	);

	const viewLink = (next: View) =>
		workspaceHref(`/inbox${next === "needs" ? "" : `?view=${next}`}`);

	return (
		<div class="flex min-h-0 flex-1 flex-col">
			<ShellSlot name="crumb">
				{project() ? project() : VIEWS.find((v) => v.value === view())?.label}
			</ShellSlot>
			<ShellSlot name="subtitle">
				{project()
					? `${project()} · ${needLabel(inboxStore.unread())}`
					: needLabel(inboxStore.unread())}
			</ShellSlot>
			<ShellSlot name="actions">
				<IconButton label="Refresh" size="sm" disabled={inboxStore.loading()} onClick={refresh}>
					<Show when={inboxStore.loading()} fallback={<RestoreIcon />}>
						<SpinnerIcon />
					</Show>
				</IconButton>
				<Show when={inboxStore.unread() > 0}>
					<Button
						size="sm"
						icon={<CheckIcon size="sm" />}
						onClick={() => {
							const token = auth.token();
							if (token) void inboxStore.readAll(token);
						}}
					>
						Mark all done
					</Button>
				</Show>
			</ShellSlot>
			<ShellSlot name="panel">
				<section aria-label="Inbox views" class="flex flex-col gap-0.5">
					<For each={VIEWS}>
						{(item) => (
							<NavLink
								href={viewLink(item.value)}
								icon={item.icon()}
								label={item.label}
								current={!project() && view() === item.value}
								trailing={
									<Text as="span" size="caption" tone="subtle" tabular>
										{countIn(item.value) || ""}
									</Text>
								}
							/>
						)}
					</For>
				</section>
				<Show when={projects().length > 0}>
					<div class="pt-2">
						<NavSection label="Projects">
							<For each={projects()}>
								{(entry) => (
									<NavLink
										href={workspaceHref(
											`/inbox?view=all&project=${encodeURIComponent(entry.slug)}`,
										)}
										icon={<FolderIcon />}
										label={entry.slug}
										current={project() === entry.slug}
										trailing={
											<Text as="span" size="caption" tone="subtle" tabular>
												{entry.unread || ""}
											</Text>
										}
									/>
								)}
							</For>
						</NavSection>
					</div>
				</Show>
			</ShellSlot>

			<div class="flex min-h-0 flex-1">
				<div class="flex min-h-0 w-full flex-col overflow-y-auto overscroll-contain p-2 lg:w-100 lg:shrink-0 lg:border-line lg:border-r">
					<div class={`flex flex-col gap-2 px-2 pt-1 pb-2 ${shell.collapsed() ? "" : "lg:hidden"}`}>
						<Segmented
							label="Show"
							block
							value={view()}
							onChange={(next) =>
								setSearch({ view: next === "needs" ? undefined : next, project: undefined })
							}
							options={VIEWS.map((v) => ({
								value: v.value,
								label: v.value === "all" ? "All" : v.label,
								count: v.value === "needs" ? inboxStore.unread() : undefined,
								countTone: "quiet" as const,
							}))}
						/>
						{/* Phones: the bar has no room for the page's actions, so they sit over the list. */}
						<div class="flex items-center gap-2 lg:hidden">
							<Show when={project()}>
								{(slug) => (
									<Button
										size="sm"
										icon={<CloseIcon size="sm" />}
										onClick={() => setSearch({ project: undefined })}
									>
										{slug()}
									</Button>
								)}
							</Show>
							<span class="flex-1" />
							<Show when={inboxStore.unread() > 0}>
								<Button
									size="sm"
									variant="ghost"
									onClick={() => {
										const token = auth.token();
										if (token) void inboxStore.readAll(token);
									}}
								>
									Mark all done
								</Button>
							</Show>
							<IconButton
								label="Refresh"
								size="sm"
								disabled={inboxStore.loading()}
								onClick={refresh}
							>
								<Show when={inboxStore.loading()} fallback={<RestoreIcon />}>
									<SpinnerIcon />
								</Show>
							</IconButton>
						</div>
					</div>

					<Show when={inboxStore.error()}>
						{(reason) => (
							<Alert
								tone="danger"
								title={reason()}
								action={
									<Button size="sm" onClick={refresh}>
										Try again
									</Button>
								}
							/>
						)}
					</Show>

					<Show
						when={inboxStore.loaded()}
						fallback={
							<div class="flex flex-col gap-1.5 p-1">
								<Skeleton class="h-16" />
								<Skeleton class="h-16" />
								<Skeleton class="h-16" />
							</div>
						}
					>
						<Show
							when={shown().length > 0}
							fallback={
								<Show when={!inboxStore.error()}>
									<EmptyState
										icon={<InboxIcon size="md" />}
										title={view() === "needs" ? "Nothing is waiting on you" : "Nothing here yet"}
										description="An agent asking for approval, a turn that ended while you were away, or a pull request wanting your review shows up here."
										action={
											<Show when={view() === "needs" && inboxStore.items().length > 0}>
												<Button size="sm" onClick={() => setSearch({ view: "all" })}>
													See all activity
												</Button>
											</Show>
										}
									/>
								</Show>
							}
						>
							<For each={days()}>
								{(label, index) => (
									<section aria-label={label} class="flex flex-col gap-0.5">
										<FeedGroup first={index() === 0}>{label}</FeedGroup>
										<For each={byDay().get(label) ?? []}>
											{(item) => (
												<FeedRow
													tone={KINDS[item.kind].tone}
													icon={KINDS[item.kind].icon()}
													title={item.title}
													meta={item.project}
													body={item.body}
													time={relativeTime(item.createdAt)}
													unread={item.readAt === null}
													id={item.id}
													current={shell.desktop() && selected()?.id === item.id}
													onClick={() => (shell.desktop() ? setSelectedId(item.id) : open(item))}
												/>
											)}
										</For>
									</section>
								)}
							</For>
							<div class="hidden items-center gap-3 px-3 pt-4 pb-2 text-caption text-fg-subtle lg:flex">
								<span class="flex items-center gap-1">
									<Kbd>E</Kbd> Done
								</span>
								<span class="flex items-center gap-1">
									<Kbd>J</Kbd> Next
								</span>
								<span class="flex items-center gap-1">
									<Kbd>K</Kbd> Previous
								</span>
							</div>
						</Show>
					</Show>

					<Show when={inboxStore.loaded() && !inboxStore.error() && !inboxStore.github()}>
						<Text tone="faint" class="block px-3 pt-3">
							Connect GitHub to see the review requests and failing checks on your pull requests.
						</Text>
					</Show>
				</div>

				<div class="hidden min-w-0 flex-1 overflow-y-auto lg:block">
					<Show when={selected()}>
						{(item) => (
							<InboxDetail
								item={item()}
								project={item().project}
								onOpen={() => open(item())}
								onDone={() => markDone(item())}
							/>
						)}
					</Show>
				</div>
			</div>
		</div>
	);
}

/** The item you are looking at, beside the list (the Figma Inbox detail). */
function InboxDetail(props: {
	item: InboxItem;
	project: string;
	onOpen: () => void;
	onDone: () => void;
}): JSX.Element {
	const kind = () => KINDS[props.item.kind];
	return (
		<article class="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-6 xl:px-14">
			<header class="flex items-center gap-3">
				<ToneTile tone={kind().tone} size="lg">
					{kind().icon()}
				</ToneTile>
				<div class="flex min-w-0 flex-1 flex-col gap-0.5">
					<Text as="h2" size="headline" tone="strong" weight="medium" truncate>
						{props.item.title}
					</Text>
					<Text tone="default" truncate>
						{props.project}
					</Text>
				</div>
				<Show when={props.item.readAt === null}>
					<IconButton
						label="Mark done"
						shortcut="E"
						variant="secondary"
						shape="round"
						onClick={props.onDone}
					>
						<CheckIcon />
					</IconButton>
				</Show>
				<Button size="sm" icon={<ExternalIcon size="sm" />} onClick={props.onOpen}>
					{kind().open}
				</Button>
			</header>

			<InfoStrip
				trailing={`${props.item.readAt === null ? "Waiting" : "Done"} · ${relativeTime(props.item.createdAt)}`}
			>
				{kind().state}
			</InfoStrip>

			<div class="surface-card flex flex-col gap-4 p-6">
				<Text size="body-lg" tone="strong" lines>
					{props.item.body}
				</Text>
				<div class="flex justify-end">
					<Button variant="primary" onClick={props.onOpen}>
						{kind().open}
					</Button>
				</div>
			</div>
		</article>
	);
}
