import { createSignal, untrack } from "solid-js";

import { localStore } from "@/lib/local-store";

import { chatService } from "../services/chat.service";
import type { ChatProvider, ProviderSettings } from "../types/chat.types";

// Each machine's provider list is kept per account, like the project/thread caches.
const cacheKey = (scope: string) => `providers:${scope}`;
function keep(scope: string, list: ChatProvider[]): void {
	void localStore.set(cacheKey(scope), list);
}
const [byScope, setByScope] = createSignal<Record<string, ChatProvider[]>>({});
const [errors, setErrors] = createSignal<Record<string, string | null>>({});
const loading = new Map<string, Promise<void>>();
let sequence = 0;
const reads = new Map<string, number>();
localStore.onUserChange(() => {
	setByScope({});
	setErrors({});
	loading.clear();
	reads.clear();
});

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
		const running = loading.get(scope);
		if (running) return running;
		const started = localStore.version();
		const request = ++sequence;
		reads.set(scope, request);
		const current = () => started === localStore.version() && reads.get(scope) === request;
		const work = (async () => {
			if (!(scope in untrack(byScope))) {
				const kept = await localStore.get<ChatProvider[]>(cacheKey(scope));
				if (current() && kept) setByScope({ ...untrack(byScope), [scope]: kept });
			}
			if (!current()) return;
			try {
				const list = await chatService.providers(token, scope);
				if (!current()) return;
				put(scope, list);
				setErrors({ ...untrack(errors), [scope]: null });
			} catch (cause) {
				if (!current()) return;
				loading.delete(scope);
				setErrors({
					...untrack(errors),
					[scope]: cause instanceof Error ? cause.message : "Could not reach the runner",
				});
			}
		})();
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
		const started = localStore.version();
		const provider = await chatService.refreshProvider(token, id, scope);
		if (started === localStore.version()) replace(scope, provider);
	},
	async saveSettings(
		token: string,
		id: string,
		settings: ProviderSettings,
		scope = "",
	): Promise<void> {
		const started = localStore.version();
		await chatService.saveProviderSettings(token, id, settings, scope);
		if (started !== localStore.version()) return;
		const current = (untrack(byScope)[scope] ?? []).find((provider) => provider.id === id);
		if (current) replace(scope, { ...current, settings });
	},
};

/** Agents offered for new chats: installed, and not turned off in settings. */
export function offeredProviders(list: ChatProvider[]): ChatProvider[] {
	return list.filter((provider) => provider.available && provider.settings?.enabled !== false);
}

/** Agents by their own name, for when a machine's agent list has not been read yet. */
const AGENT_NAMES: Record<string, string> = {
	claude: "Claude Code",
	codex: "Codex",
	opencode: "opencode",
	antigravity: "Antigravity",
};

/** An agent's name from a machine's agent list, by its provider id. */
export function agentName(id: string, scope = ""): string {
	return (
		providersStore.providers(scope).find((provider) => provider.id === id)?.name ??
		AGENT_NAMES[id] ??
		id
	);
}
