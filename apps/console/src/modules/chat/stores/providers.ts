import { createSignal, untrack } from "solid-js";

import { chatService } from "../services/chat.service";
import type { ChatProvider, ProviderSettings } from "../types/chat.types";

const CACHE_KEY = "grid.chat.providers";

function cachedProviders(): ChatProvider[] {
	try {
		const saved: unknown = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "[]");
		return Array.isArray(saved) ? (saved as ChatProvider[]) : [];
	} catch {
		return [];
	}
}

function keep(list: ChatProvider[]): void {
	try {
		localStorage.setItem(CACHE_KEY, JSON.stringify(list));
	} catch {
		// Not kept; the next load asks the runner again.
	}
}

// One list for the whole console: chats and settings read the same copy. It shows the last
// list straight away and is read from the runner once per visit, never per chat.
const [providers, setProviders] = createSignal<ChatProvider[]>(cachedProviders());
const [providersError, setProvidersError] = createSignal<string | null>(null);
let loading: Promise<void> | null = null;

function replace(next: ChatProvider): void {
	const list = untrack(providers).map((provider) => (provider.id === next.id ? next : provider));
	setProviders(list);
	keep(list);
}

export const providersStore = {
	providers,
	error: providersError,
	/** Read the agents from the runner, once per visit (later calls share the first). */
	load(token: string): Promise<void> {
		loading ??= chatService.providers(token).then(
			(list) => {
				setProviders(list);
				setProvidersError(null);
				keep(list);
			},
			(cause: unknown) => {
				loading = null;
				setProvidersError(cause instanceof Error ? cause.message : "Could not reach the runner");
			},
		);
		return loading;
	},
	/** Ask one agent for its models again. */
	async refresh(token: string, id: string): Promise<void> {
		replace(await chatService.refreshProvider(token, id));
	},
	async saveSettings(token: string, id: string, settings: ProviderSettings): Promise<void> {
		await chatService.saveProviderSettings(token, id, settings);
		const current = untrack(providers).find((provider) => provider.id === id);
		if (current) replace({ ...current, settings });
	},
};

/** Agents offered for new chats: installed, and not turned off in settings. */
export function offeredProviders(list: ChatProvider[]): ChatProvider[] {
	return list.filter((provider) => provider.available && provider.settings?.enabled !== false);
}
