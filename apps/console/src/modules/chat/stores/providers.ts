import { createSignal, untrack } from "solid-js";

import { chatService } from "../services/chat.service";
import type { ChatProvider, ProviderSettings } from "../types/chat.types";

// Each machine has its own agents: this one under "", an environment under its runner scope.
const cacheKey = (scope: string) => `grid.chat.providers${scope ? `.${scope}` : ""}`;

function cachedProviders(scope: string): ChatProvider[] {
	try {
		const saved: unknown = JSON.parse(localStorage.getItem(cacheKey(scope)) ?? "[]");
		return Array.isArray(saved) ? (saved as ChatProvider[]) : [];
	} catch {
		return [];
	}
}

function keep(scope: string, list: ChatProvider[]): void {
	try {
		localStorage.setItem(cacheKey(scope), JSON.stringify(list));
	} catch {
		// Not kept; the next load asks the runner again.
	}
}

// One list per machine for the whole console: chats and settings read the same copy. It shows
// the last list straight away and is read from the runner once per visit, never per chat.
const [byScope, setByScope] = createSignal<Record<string, ChatProvider[]>>({
	"": cachedProviders(""),
});
const [errors, setErrors] = createSignal<Record<string, string | null>>({});
const loading = new Map<string, Promise<void>>();

function put(scope: string, list: ChatProvider[]): void {
	setByScope({ ...untrack(byScope), [scope]: list });
	keep(scope, list);
}

function replace(scope: string, next: ChatProvider): void {
	const list = (untrack(byScope)[scope] ?? []).map((provider) =>
		provider.id === next.id ? next : provider,
	);
	put(scope, list);
}

export const providersStore = {
	/** The agents on a machine; `scope` is empty for this one. */
	providers: (scope = ""): ChatProvider[] => byScope()[scope] ?? [],
	error: (scope = ""): string | null => errors()[scope] ?? null,
	/** Read a machine's agents, once per visit (later calls share the first). */
	load(token: string, scope = ""): Promise<void> {
		if (!(scope in untrack(byScope))) {
			setByScope({ ...untrack(byScope), [scope]: cachedProviders(scope) });
		}
		const running = loading.get(scope);
		if (running) return running;
		const work = chatService.providers(token, scope).then(
			(list) => {
				put(scope, list);
				setErrors({ ...untrack(errors), [scope]: null });
			},
			(cause: unknown) => {
				loading.delete(scope);
				setErrors({
					...untrack(errors),
					[scope]: cause instanceof Error ? cause.message : "Could not reach the runner",
				});
			},
		);
		loading.set(scope, work);
		return work;
	},
	/** Re-fetch agents after a drop or runner restart. */
	reload(token: string, scope = ""): Promise<void> {
		loading.delete(scope);
		return providersStore.load(token, scope);
	},
	/** Ask one agent for its models again. */
	async refresh(token: string, id: string, scope = ""): Promise<void> {
		replace(scope, await chatService.refreshProvider(token, id, scope));
	},
	async saveSettings(
		token: string,
		id: string,
		settings: ProviderSettings,
		scope = "",
	): Promise<void> {
		await chatService.saveProviderSettings(token, id, settings, scope);
		const current = (untrack(byScope)[scope] ?? []).find((provider) => provider.id === id);
		if (current) replace(scope, { ...current, settings });
	},
};

/** Agents offered for new chats: installed, and not turned off in settings. */
export function offeredProviders(list: ChatProvider[]): ChatProvider[] {
	return list.filter((provider) => provider.available && provider.settings?.enabled !== false);
}
