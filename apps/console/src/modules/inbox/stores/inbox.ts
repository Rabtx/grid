import { createSignal, untrack } from "solid-js";

import { placementsStore } from "@/modules/environments";

import { inboxService } from "../services/inbox.service";
import type { InboxItem } from "../types/inbox.types";

// What is waiting, shared by the Inbox page and the sidebar's count so the two never disagree.
// Every machine answers: a project running on an environment keeps its threads' items there.
const [items, setItems] = createSignal<InboxItem[]>([]);
const [unread, setUnread] = createSignal(0);
const [loading, setLoading] = createSignal(false);
const [loaded, setLoaded] = createSignal(false);
const [error, setError] = createSignal<string | null>(null);
/** Whether GitHub was reachable for this person, so the page can offer to connect it. */
const [github, setGithub] = createSignal(false);
let pending: Promise<void> | null = null;
// A count in flight: the sidebar is mounted more than once (the column and the drawer), and two
// people opening the app should not be two sets of calls.
let counting: Promise<void> | null = null;

const newestFirst = (list: InboxItem[]) =>
	[...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

/** The page an item points at, without its query: a pull request's row stands for its project. */
function pageOf(item: InboxItem): string {
	return item.url.split("?")[0];
}

/** Marks the rows a predicate covers as read here, and counts what is left. */
function markReadLocally(matches: (item: InboxItem) => boolean): void {
	const at = new Date().toISOString();
	const next = untrack(items).map((row) =>
		matches(row) ? { ...row, readAt: row.readAt ?? at } : row,
	);
	setItems(next);
	setUnread(next.filter((row) => row.readAt === null).length);
}

export const inboxStore = {
	items,
	unread,
	loading,
	loaded,
	error,
	github,

	/** Reads the inbox, asking GitHub as well when `refresh` is the page's own Refresh. */
	load(token: string, refresh = false): Promise<void> {
		pending ??= (async () => {
			setLoading(true);
			setError(null);
			try {
				const scopes = untrack(placementsStore.scopes);
				const answers = await Promise.all(
					scopes.map((scope) =>
						inboxService.list(token, scope, refresh).then(
							(view) => ({ view, reason: null }),
							(cause: unknown) => ({
								view: null,
								reason: cause instanceof Error ? cause.message : "The inbox did not answer",
							}),
						),
					),
				);
				const answered = answers.filter((answer) => answer.view !== null);
				// Nothing answering at all is a failure to show; one machine being down is not.
				if (answered.length === 0) {
					setError(answers[0]?.reason ?? "The inbox did not answer");
				} else {
					setItems(newestFirst(answered.flatMap((answer) => answer.view?.items ?? [])));
					setUnread(answered.reduce((total, answer) => total + (answer.view?.unread ?? 0), 0));
					setGithub(answered.some((answer) => answer.view?.github === true));
				}
				setLoaded(true);
			} finally {
				// Whatever happened, the next read is a new one: a store stuck loading answers nobody.
				setLoading(false);
				pending = null;
			}
		})();
		return pending;
	},

	/** The count on its own, for the sidebar before anyone opens the page. */
	async count(token: string): Promise<void> {
		if (counting) return counting;
		counting = (async () => {
			const scopes = untrack(placementsStore.scopes);
			const answers = await Promise.all(
				scopes.map((scope) =>
					inboxService.unread(token, scope).then(
						(value) => value.unread,
						// A machine that cannot be reached has nothing to add; the rest still count.
						() => null,
					),
				),
			);
			// Every machine unreachable: whatever the count was is closer to the truth than zero.
			if (answers.some((value) => value !== null)) {
				setUnread(answers.reduce<number>((total, value) => total + (value ?? 0), 0));
			}
		})().finally(() => {
			counting = null;
		});
		return counting;
	},

	/**
	 * Follows an item: everything waiting about that thread is dealt with, because the person is
	 * going there to deal with it.
	 */
	async open(token: string, item: InboxItem): Promise<void> {
		await inboxStore.readPage(token, pageOf(item));
	},

	/**
	 * Marks everything pointing at a page read, which is what arriving at a thread or a pull
	 * request means. The count is asked again afterwards: the runner's answer is the truth, and
	 * another machine may hold rows this device cannot see.
	 */
	async readPage(token: string, path: string): Promise<void> {
		markReadLocally((row) => pageOf(row) === path);
		await Promise.all(untrack(placementsStore.scopes).map((scope) => ask(token, scope, { path })));
		await inboxStore.count(token);
	},

	/** Everything dealt with, from the page's own action. */
	async readAll(token: string): Promise<void> {
		markReadLocally(() => true);
		await Promise.all(untrack(placementsStore.scopes).map((scope) => ask(token, scope, {})));
		await inboxStore.count(token);
	},
};

/** Asks one machine to mark things read; a machine that will not answer is not worth an error. */
async function ask(
	token: string,
	scope: string,
	what: { id?: string; path?: string },
): Promise<void> {
	await inboxService.read(token, what, scope).catch(() => null);
}
