/**
 * What the console keeps on this device, in IndexedDB (built into every browser): the last known
 * chats, terminal screens, thread lists and environments, so the app shows them the moment it
 * opens or comes back, and the network only brings what is new.
 *
 * Everything is kept per signed-in account and workspace (keys are prefixed with both) and wiped on
 * sign-out. Nothing here is the source of truth: the runner is, and it corrects this on every
 * connect. When IndexedDB is unavailable (some private windows), reads find nothing and writes
 * are dropped; the app works as before, only without the head start.
 */

import { activeWorkspace } from "./active-workspace";

const DB_NAME = "grid";
const STORE = "kv";

let opening: Promise<IDBDatabase | null> | null = null;
let user: string | null = null;
let version = 0;
const userListeners = new Set<() => void>();

function open(): Promise<IDBDatabase | null> {
	opening ??= new Promise((resolve) => {
		try {
			const request = indexedDB.open(DB_NAME, 1);
			request.onupgradeneeded = () => {
				if (!request.result.objectStoreNames.contains(STORE)) {
					request.result.createObjectStore(STORE);
				}
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => resolve(null);
			request.onblocked = () => resolve(null);
		} catch {
			resolve(null);
		}
	});
	return opening;
}

async function run<T>(
	mode: IDBTransactionMode,
	work: (store: IDBObjectStore) => IDBRequest<T>,
	current: () => boolean = () => true,
): Promise<T | undefined> {
	const db = await open();
	if (!db || !current()) return undefined;
	return new Promise((resolve) => {
		try {
			const request = work(db.transaction(STORE, mode).objectStore(STORE));
			request.onsuccess = () => resolve(current() ? request.result : undefined);
			request.onerror = () => resolve(undefined);
		} catch {
			resolve(undefined);
		}
	});
}

function scoped(key: string): string | null {
	if (!user) return null;
	// A chosen workspace keeps its own copy; the default one keeps the original keys.
	const workspace = activeWorkspace();
	return workspace ? `${user}@${workspace}:${key}` : `${user}:${key}`;
}

export const localStore = {
	/** Whose data is read and written: set on sign-in, cleared on sign-out. */
	setUser(id: string | null): void {
		if (user === id) return;
		user = id;
		version++;
		for (const listener of userListeners) listener();
	},
	/**
	 * Start the page as the account this device remembers, before anything renders. Nothing has
	 * been read for anyone yet, so there is nothing for the account listeners to clear: they are
	 * not told. (Telling them here also wrote to their signals while the app was first rendering,
	 * which halts Solid's development build and left a blank page on every reload.)
	 */
	restoreUser(id: string): void {
		if (user !== null) return;
		user = id;
	},
	/** In-flight work from a previous account must not publish into this account. */
	version: (): number => version,
	/** Account/workspace scope for small synchronous route memories; null when signed out. */
	storageKey: (key: string): string | null => {
		const full = scoped(key);
		return full ? `grid.private:${full}` : null;
	},
	onUserChange(listener: () => void): () => void {
		userListeners.add(listener);
		return () => userListeners.delete(listener);
	},

	async get<T>(key: string): Promise<T | undefined> {
		const full = scoped(key);
		const started = version;
		return full
			? ((await run(
					"readonly",
					(store) => store.get(full),
					() => started === version,
				)) as T | undefined)
			: undefined;
	},

	async set(key: string, value: unknown): Promise<void> {
		const full = scoped(key);
		const started = version;
		if (full)
			await run(
				"readwrite",
				(store) => store.put(value, full),
				() => started === version,
			);
	},

	async delete(key: string): Promise<void> {
		const full = scoped(key);
		const started = version;
		if (full)
			await run(
				"readwrite",
				(store) => store.delete(full),
				() => started === version,
			);
	},

	/** Forget everything on this device (sign-out). */
	async clear(): Promise<void> {
		await run("readwrite", (store) => store.clear());
	},
};

/**
 * Save something often-changing at most once per `ms`: the latest value wins. Returns `flush`
 * to write straight away (the page is going into the background) and `cancel`.
 */
export function saveSoon<T>(
	key: string,
	value: () => T,
	ms = 1_000,
): { schedule: () => void; flush: () => void; cancel: () => void } {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let scheduledFor = version;
	const write = () => {
		timer = undefined;
		if (scheduledFor === version) void localStore.set(key, value());
	};
	return {
		schedule: () => {
			if (timer !== undefined && scheduledFor !== version) clearTimeout(timer);
			if (timer === undefined || scheduledFor !== version) {
				scheduledFor = version;
				timer = setTimeout(write, ms);
			}
		},
		flush: () => {
			if (timer === undefined) return;
			clearTimeout(timer);
			write();
		},
		cancel: () => {
			clearTimeout(timer);
			timer = undefined;
		},
	};
}
