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
): Promise<T | undefined> {
	const db = await open();
	if (!db) return undefined;
	return new Promise((resolve) => {
		try {
			const request = work(db.transaction(STORE, mode).objectStore(STORE));
			request.onsuccess = () => resolve(request.result);
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
		user = id;
	},

	async get<T>(key: string): Promise<T | undefined> {
		const full = scoped(key);
		return full
			? ((await run("readonly", (store) => store.get(full))) as T | undefined)
			: undefined;
	},

	async set(key: string, value: unknown): Promise<void> {
		const full = scoped(key);
		if (full) await run("readwrite", (store) => store.put(value, full));
	},

	async delete(key: string): Promise<void> {
		const full = scoped(key);
		if (full) await run("readwrite", (store) => store.delete(full));
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
	const write = () => {
		timer = undefined;
		void localStore.set(key, value());
	};
	return {
		schedule: () => {
			timer ??= setTimeout(write, ms);
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
