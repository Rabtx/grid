import { createSignal, untrack } from "solid-js";

import { playChime } from "@/lib/chime";
import { localStore } from "@/lib/local-store";
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
/** The newest read of the list: an older one that answers late is not allowed to win. */
let latestLoad = 0;
/**
 * Bumped whenever the list or the count changes here, so a count that set out before the change
 * does not put back what it replaced.
 */
let version = 0;
/**
 * What was marked read here while a list was being read, applied again to its answer: the runner
 * may have answered before it heard, and the person's own tap should not come undone.
 */
let readWhileLoading: ((item: InboxItem) => boolean)[] = [];
// A count in flight: the sidebar is mounted more than once (the column and the drawer), and two
// people opening the app should not be two sets of calls.
let counting: Promise<void> | null = null;

/** Whether a count has come back yet: the first one is what was already waiting. */
let counted = false;
localStore.onUserChange(() => {
	latestLoad++;
	version++;
	pending = null;
	counting = null;
	counted = false;
	readWhileLoading = [];
	setItems([]);
	setUnread(0);
	setLoading(false);
	setLoaded(false);
	setError(null);
	setGithub(false);
});

/** The count, with a chime when it grows after the first (something new needs you). */
function setCount(next: number): void {
	if (counted && next > untrack(unread)) playChime();
	counted = true;
	setUnread(next);
}

const newestFirst = (list: InboxItem[]) =>
	[...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

/** The page an item points at, without its query: a pull request's row stands for its project. */
function pageOf(item: InboxItem): string {
	return item.url.split("?")[0];
}

/** Marks the rows a predicate covers as read here, and counts what is left. */
function markReadLocally(matches: (item: InboxItem) => boolean): void {
	if (pending) readWhileLoading.push(matches);
	const next = markRead(untrack(items), matches);
	version += 1;
	setItems(next);
	setCount(next.filter((row) => row.readAt === null).length);
}

function markRead(list: InboxItem[], matches: (item: InboxItem) => boolean): InboxItem[] {
	const at = new Date().toISOString();
	return list.map((row) => (matches(row) ? { ...row, readAt: row.readAt ?? at } : row));
}

export const inboxStore = {
	items,
	unread,
	loading,
	loaded,
	error,
	github,

	/**
	 * Reads the inbox, asking GitHub as well when `refresh` is the page's own Refresh. A plain read
	 * joins one already under way; a Refresh starts its own, and only the newest read is shown.
	 */
	load(token: string, refresh = false): Promise<void> {
		if (pending && !refresh) return pending;
		const ticket = ++latestLoad;
		const run = (async () => {
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
				if (ticket !== latestLoad) return;
				const answered = answers.filter((answer) => answer.view !== null);
				// Nothing answering at all is a failure to show; one machine being down is not.
				if (answered.length === 0) {
					setError(answers[0]?.reason ?? "The inbox did not answer");
				} else {
					let next = newestFirst(answered.flatMap((answer) => answer.view?.items ?? []));
					for (const matches of readWhileLoading) next = markRead(next, matches);
					const readHere = readWhileLoading.length > 0;
					version += 1;
					setItems(next);
					// The runners' own count covers rows past the list's limit; a read made here while
					// they answered is counted from the rows instead.
					setCount(
						readHere
							? next.filter((row) => row.readAt === null).length
							: answered.reduce((total, answer) => total + (answer.view?.unread ?? 0), 0),
					);
					setGithub(answered.some((answer) => answer.view?.github === true));
				}
				setLoaded(true);
			} finally {
				// Whatever happened, the next read is a new one: a store stuck loading answers nobody.
				if (ticket === latestLoad) {
					setLoading(false);
					readWhileLoading = [];
					pending = null;
				}
			}
		})();
		pending = run;
		return run;
	},

	/** The count on its own, for the sidebar before anyone opens the page. */
	async count(token: string): Promise<void> {
		if (counting) return counting;
		const since = version;
		const work = (async () => {
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
			// A list read or a tap since this set out already knows better.
			if (since === version && answers.some((value) => value !== null)) {
				setCount(answers.reduce<number>((total, value) => total + (value ?? 0), 0));
			}
		})().finally(() => {
			if (counting === work) counting = null;
		});
		counting = work;
		return work;
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

	/** One item dealt with, from its own Mark done: only that row, wherever it points. */
	async readItem(token: string, id: string): Promise<void> {
		markReadLocally((row) => row.id === id);
		await Promise.all(untrack(placementsStore.scopes).map((scope) => ask(token, scope, { id })));
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
