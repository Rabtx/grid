import { localStore } from "./local-store";

/** Private route memories share the same account/workspace boundary as IndexedDB. Legacy global
 * keys are deliberately ignored: there is no reliable way to identify who owned them. */
export const accountStorage = {
	get(key: string): string | null {
		const scoped = localStore.storageKey(key);
		try {
			return scoped ? localStorage.getItem(scoped) : null;
		} catch {
			return null;
		}
	},
	set(key: string, value: string): void {
		const scoped = localStore.storageKey(key);
		try {
			if (scoped) localStorage.setItem(scoped, value);
		} catch {
			/* Unavailable storage: the active route still owns its state. */
		}
	},
	delete(key: string): void {
		const scoped = localStore.storageKey(key);
		try {
			if (scoped) localStorage.removeItem(scoped);
		} catch {
			/* Nothing to remove when storage is unavailable. */
		}
	},
};
