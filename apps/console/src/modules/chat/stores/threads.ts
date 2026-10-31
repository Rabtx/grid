import { createSignal, untrack } from "solid-js";

import { localStore } from "@/lib/local-store";
import { placementsStore } from "@/modules/environments";

import { chatService } from "../services/chat.service";
import type { ChatSession, RunningThread } from "../types/chat.types";

// Each project's threads, shared by the sidebar tree and the chat screen, so a rename or a new
// thread shows everywhere at once.
const [byProject, setByProject] = createSignal<Record<string, ChatSession[]>>({});
const [loaded, setLoaded] = createSignal<Record<string, boolean>>({});
const [errors, setErrors] = createSignal<Record<string, string | null>>({});
// Where each project's next page of threads starts, how many it has in all, and whether a page is
// on its way. A project's threads are read a page at a time; `threads` holds what is here.
const [nextCursors, setNextCursors] = createSignal<Record<string, string | null>>({});
const [totals, setTotals] = createSignal<Record<string, number>>({});
const [loadingMore, setLoadingMore] = createSignal<Record<string, boolean>>({});
const PAGE_SIZE = 20;
const pending = new Map<string, Promise<void>>();
const morePending = new Map<string, Promise<void>>();
const ensurePending = new Map<string, Promise<boolean>>();
// Threads with a turn in flight: read from the runner every few seconds, and set at once by the
// open conversation when its own turn starts or ends.
const [running, setRunningList] = createSignal<RunningThread[]>([]);
// Threads whose turn ended while nobody was looking at them: their tab shows a dot until opened.
const [unseen, setUnseen] = createSignal<ReadonlySet<string>>(new Set<string>());
let viewing: string | null = null;
const POLL_MS = 3000;
// Each machine's last answer, by scope, for a machine that misses one poll.
const lastRunning = new Map<string, RunningThread[]>();

function setRunning(next: RunningThread[]): void {
	const still = new Set(next.map((item) => item.id));
	const ended = untrack(running).filter((item) => !still.has(item.id) && item.id !== viewing);
	if (ended.length) setUnseen(new Set([...untrack(unseen), ...ended.map((item) => item.id)]));
	setRunningList(next);
}
const reads = new Map<string, number>();
const changedDuringRead = new Map<string, Set<string>>();
let sequence = 0;
localStore.onUserChange(() => {
	setByProject({});
	setLoaded({});
	setErrors({});
	setNextCursors({});
	setTotals({});
	setLoadingMore({});
	setRunningList([]);
	setUnseen(new Set<string>());
	pending.clear();
	morePending.clear();
	ensurePending.clear();
	lastRunning.clear();
	reads.clear();
	changedDuringRead.clear();
});
function changed(project: string, id: string): void {
	changedDuringRead.get(project)?.add(id);
}

const newestFirst = (list: ChatSession[]) =>
	[...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

const cacheKey = (project: string) => `threads:${project}`;

function put(project: string, list: ChatSession[]): void {
	const sorted = newestFirst(list);
	setByProject({ ...untrack(byProject), [project]: sorted });
	// Kept on the device: the project's threads show at once next time.
	void localStore.set(cacheKey(project), sorted);
}

export const threadsStore = {
	/** True while an agent is working in this thread. */
	isRunning: (id: string): boolean => running().some((item) => item.id === id),
	/** True while this thread's agent waits on a person: an approval or a question. */
	isWaiting: (id: string): boolean => running().some((item) => item.id === id && item.waiting),
	/** True when this thread's turn ended since it was last open. */
	isUnseen: (id: string): boolean => unseen().has(id),
	/** The thread in front of the person: its turns ending are seen as they happen. */
	setViewing(id: string | null): void {
		viewing = id;
		if (id && untrack(unseen).has(id)) {
			const next = new Set(untrack(unseen));
			next.delete(id);
			setUnseen(next);
		}
	},
	/** How many threads in this project are working. */
	runningIn: (project: string): number =>
		running().filter((item) => item.project === project).length,
	/** The open conversation knows first: mark its thread running or done straight away. */
	markRunning(id: string, project: string, value: boolean): void {
		const waiting = untrack(running).some((item) => item.id === id && item.waiting);
		const rest = untrack(running).filter((item) => item.id !== id);
		setRunning(value ? [...rest, { id, project, waiting }] : rest);
	},
	/** Keep the running list fresh while the app is visible; returns a stop function. */
	watchRunning(token: () => string | null): () => void {
		let timer: ReturnType<typeof setTimeout> | undefined;
		let stopped = false;
		const tick = async () => {
			const started = localStore.version();
			const value = token();
			if (value && document.visibilityState === "visible") {
				// This machine and every environment a project runs on. One that cannot be reached
				// keeps its last answer rather than dropping its threads' indicators.
				const scopes = untrack(placementsStore.scopes);
				const answers = await Promise.all(
					scopes.map((scope) =>
						chatService.running(value, scope).then(
							(list) => ({ scope, list }),
							() => ({ scope, list: null }),
						),
					),
				);
				if (!stopped && started === localStore.version() && token() === value) {
					for (const { scope, list } of answers) if (list) lastRunning.set(scope, list);
					setRunning(scopes.flatMap((scope) => lastRunning.get(scope) ?? []));
				}
			}
			if (!stopped) timer = setTimeout(() => void tick(), POLL_MS);
		};
		void tick();
		return () => {
			stopped = true;
			clearTimeout(timer);
		};
	},
	threads: (project: string): ChatSession[] => byProject()[project] ?? [],
	/** How many threads the project has, loaded or not. */
	total: (project: string): number => totals()[project] ?? byProject()[project]?.length ?? 0,
	/** True while there are older pages of threads still to read. */
	hasMore: (project: string): boolean => Boolean(nextCursors()[project]),
	loadingMore: (project: string): boolean => loadingMore()[project] === true,
	loaded: (project: string): boolean => loaded()[project] === true,
	error: (project: string): string | null => errors()[project] ?? null,
	/**
	 * Read a project's first page of threads; calls while one is in flight share it. What this
	 * device kept shows first, and the runner's answer replaces it.
	 */
	load(token: string, project: string): Promise<void> {
		const running = pending.get(project);
		if (running) return running;
		const started = localStore.version();
		const request = ++sequence;
		reads.set(project, request);
		const current = () => started === localStore.version() && reads.get(project) === request;
		const changedIds = new Set<string>();
		changedDuringRead.set(project, changedIds);
		if (!untrack(loaded)[project]) {
			void localStore.get<ChatSession[]>(cacheKey(project)).then((kept) => {
				if (current() && kept?.length && !untrack(loaded)[project] && changedIds.size === 0) {
					setByProject({ ...untrack(byProject), [project]: kept });
					setTotals({ ...untrack(totals), [project]: kept.length });
				}
			});
		}
		const work = chatService
			.sessionsPage(token, project, placementsStore.scopeOf(project), PAGE_SIZE, null)
			.then(
				(page) => {
					if (!current()) return;
					put(project, [
						...page.sessions.filter((item) => !changedIds.has(item.id)),
						...(untrack(byProject)[project] ?? []).filter((item) => changedIds.has(item.id)),
					]);
					setNextCursors({ ...untrack(nextCursors), [project]: page.nextCursor });
					setTotals({ ...untrack(totals), [project]: page.total });
					setErrors({ ...untrack(errors), [project]: null });
				},
				(cause: unknown) => {
					if (!current()) return;
					setErrors({
						...untrack(errors),
						[project]: cause instanceof Error ? cause.message : "Could not load threads",
					});
				},
			)
			.finally(() => {
				if (!current()) return;
				changedDuringRead.delete(project);
				pending.delete(project);
				setLoaded({ ...untrack(loaded), [project]: true });
			});
		pending.set(project, work);
		return work;
	},
	/** Read the next page of a project's threads and add it to what is here. */
	loadMore(token: string, project: string): Promise<void> {
		const cursor = untrack(nextCursors)[project] ?? null;
		if (!cursor) return Promise.resolve();
		const running = morePending.get(project);
		if (running) return running;
		const started = localStore.version();
		const request = reads.get(project) ?? 0;
		setLoadingMore({ ...untrack(loadingMore), [project]: true });
		const work = chatService
			.sessionsPage(token, project, placementsStore.scopeOf(project), PAGE_SIZE, cursor)
			.then(
				(page) => {
					if (started !== localStore.version() || reads.get(project) !== request) return;
					const seen = new Set(untrack(byProject)[project]?.map((item) => item.id) ?? []);
					const added = page.sessions.filter((item) => !seen.has(item.id));
					put(project, [...(untrack(byProject)[project] ?? []), ...added]);
					setNextCursors({ ...untrack(nextCursors), [project]: page.nextCursor });
					setTotals({ ...untrack(totals), [project]: page.total });
				},
				(cause: unknown) => {
					if (started !== localStore.version() || reads.get(project) !== request) return;
					setErrors({
						...untrack(errors),
						[project]: cause instanceof Error ? cause.message : "Could not load threads",
					});
				},
			)
			.finally(() => {
				setLoadingMore({ ...untrack(loadingMore), [project]: false });
				morePending.delete(project);
			});
		morePending.set(project, work);
		return work;
	},
	/** Re-read a project's threads after a drop or runner restart. */
	reload(token: string, project: string): Promise<void> {
		pending.delete(project);
		return threadsStore.load(token, project);
	},
	/**
	 * Make sure one thread is here, even when it is older than the pages already read (a link,
	 * a saved tab). Returns false when the thread is gone.
	 */
	ensure(token: string, project: string, id: string): Promise<boolean> {
		if ((untrack(byProject)[project] ?? []).some((item) => item.id === id)) {
			return Promise.resolve(true);
		}
		const key = `${project}:${id}`;
		const running = ensurePending.get(key);
		if (running) return running;
		const started = localStore.version();
		const work = chatService
			.thread(token, id, placementsStore.scopeOf(project))
			.then(
				(session) => {
					if (started !== localStore.version()) return true;
					threadsStore.upsert(session);
					return true;
				},
				() => false,
			)
			.finally(() => ensurePending.delete(key));
		ensurePending.set(key, work);
		return work;
	},
	/** A thread was created or changed (a new title, a new message). */
	upsert(session: ChatSession): void {
		changed(session.project, session.id);
		const existing = untrack(byProject)[session.project] ?? [];
		const isNew = !existing.some((item) => item.id === session.id);
		const rest = existing.filter((item) => item.id !== session.id);
		put(session.project, [session, ...rest]);
		if (isNew) {
			setTotals({
				...untrack(totals),
				[session.project]: (untrack(totals)[session.project] ?? rest.length) + 1,
			});
		}
	},
	async rename(token: string, session: ChatSession, title: string): Promise<void> {
		const started = localStore.version();
		await chatService.rename(token, session.id, title, placementsStore.scopeOf(session.project));
		if (started !== localStore.version()) return;
		threadsStore.upsert({ ...session, title });
	},
	/** Snooze a thread until a time, or wake it (null). */
	async snooze(token: string, session: ChatSession, until: Date | null): Promise<void> {
		const started = localStore.version();
		const next = await chatService.snooze(
			token,
			session.id,
			until ? until.toISOString() : null,
			placementsStore.scopeOf(session.project),
		);
		if (started !== localStore.version()) return;
		threadsStore.upsert({ ...session, snoozedUntil: next?.snoozedUntil ?? null });
	},
	/** Remove a thread's worktree; it carries on in the project's own folder. */
	async discardWorktree(
		token: string,
		session: ChatSession,
		options: { deleteBranch: boolean; force?: boolean },
	): Promise<void> {
		const started = localStore.version();
		await chatService.discardWorktree(
			token,
			session.id,
			options,
			placementsStore.scopeOf(session.project),
		);
		if (started !== localStore.version()) return;
		threadsStore.upsert({
			...session,
			cwd: session.worktree?.origin ?? session.cwd,
			worktree: null,
		});
	},
	async remove(token: string, session: ChatSession): Promise<void> {
		const started = localStore.version();
		await chatService.remove(token, session.id, placementsStore.scopeOf(session.project));
		if (started !== localStore.version()) return;
		changed(session.project, session.id);
		const present = untrack(byProject)[session.project]?.some((item) => item.id === session.id);
		put(
			session.project,
			(untrack(byProject)[session.project] ?? []).filter((item) => item.id !== session.id),
		);
		if (present) {
			setTotals({
				...untrack(totals),
				[session.project]: Math.max((untrack(totals)[session.project] ?? 1) - 1, 0),
			});
		}
	},
};
