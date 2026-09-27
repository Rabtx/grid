import { useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, Show } from "solid-js";

import {
	Alert,
	AlertIcon,
	Button,
	CheckCircleIcon,
	EmptyState,
	IconButton,
	InboxIcon,
	ListRow,
	PaneHeader,
	PullRequestIcon,
	RestoreIcon,
	Skeleton,
	SpinnerIcon,
	StatusDot,
	Text,
} from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";
import { useAuth } from "@/modules/auth";
import { relativeTime } from "@/modules/projects/lib/relative-time";

import { inboxStore } from "../stores/inbox";
import type { InboxItem, InboxKind } from "../types/inbox.types";

/** How each kind looks: an agent waiting on an answer, a turn that ended, GitHub asking. */
const ICONS: Record<InboxKind, () => JSX.Element> = {
	approval: () => <SpinnerIcon class="size-4 text-warning" />,
	turn_done: () => <CheckCircleIcon size="sm" class="text-success" />,
	turn_error: () => <AlertIcon size="sm" class="text-danger" />,
	pull_review: () => <PullRequestIcon size="sm" />,
	pull_checks: () => <AlertIcon size="sm" class="text-danger" />,
};

/** The row's right-hand side: a dot while it is unread, and how long ago it happened. */
function trailing(item: InboxItem): JSX.Element {
	return (
		<span class="flex items-center gap-1.5">
			<Show when={item.readAt === null}>
				<StatusDot status="unread" label="Unread" />
			</Show>
			{relativeTime(item.createdAt)}
		</span>
	);
}

function detail(unread: number, total: number, failed: boolean): string | undefined {
	// A read that failed knows nothing about what is waiting, so it does not say "nothing".
	if (total === 0) return failed ? undefined : "Nothing waiting";
	return unread === 0 ? "All read" : `${unread} waiting`;
}

/**
 * Everything waiting on the people in this workspace, across every project: an agent asking for
 * approval, a turn that finished or failed while nobody was looking, and — with GitHub connected —
 * the pull requests wanting a review or with checks failing. Newest first, unread marked; tapping a
 * row deals with whatever was waiting about it and goes there.
 */
export function InboxScreen(): JSX.Element {
	const auth = useAuth();
	const navigate = useNavigate();
	const [revision, setRevision] = createSignal(0);

	// Arriving reads the inbox; only the page's own Refresh asks GitHub again, however recently it
	// last did.
	createEffect(
		() => [auth.token(), revision()] as const,
		([token]) => {
			if (token) void inboxStore.load(token);
		},
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

	return (
		<div class="flex min-h-0 flex-1 flex-col">
			<PaneHeader
				title="Inbox"
				detail={detail(inboxStore.unread(), inboxStore.items().length, inboxStore.error() !== null)}
				actions={
					<>
						<Show when={inboxStore.unread() > 0}>
							<Button
								size="sm"
								variant="ghost"
								onClick={() => {
									const token = auth.token();
									if (token) void inboxStore.readAll(token);
								}}
							>
								Mark all read
							</Button>
						</Show>
						<IconButton label="Refresh" size="sm" disabled={inboxStore.loading()} onClick={refresh}>
							<Show when={inboxStore.loading()} fallback={<RestoreIcon size="sm" />}>
								<SpinnerIcon size="sm" />
							</Show>
						</IconButton>
					</>
				}
			/>

			<div class="min-h-0 flex-1 overflow-y-auto p-1.5 md:p-2">
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
							<Skeleton class="h-12" />
							<Skeleton class="h-12" />
							<Skeleton class="h-12" />
						</div>
					}
				>
					<Show
						when={inboxStore.items().length > 0}
						fallback={
							<Show when={!inboxStore.error()}>
								<EmptyState
									icon={<InboxIcon size="md" />}
									title="Nothing is waiting on you"
									description="An agent asking for approval, a turn that ended while you were away, or a pull request wanting your review shows up here."
								/>
							</Show>
						}
					>
						<For each={inboxStore.items()}>
							{(item) => (
								<ListRow
									title={item.title}
									subtitle={`${item.project} · ${item.body}`}
									trailing={trailing(item)}
									icon={ICONS[item.kind]()}
									onClick={() => open(item)}
								/>
							)}
						</For>
					</Show>
				</Show>

				<Show when={inboxStore.loaded() && !inboxStore.error() && !inboxStore.github()}>
					<Text tone="faint" class="block px-2.5 pt-3">
						Connect GitHub to see the review requests and failing checks on your pull requests.
					</Text>
				</Show>
			</div>
		</div>
	);
}
