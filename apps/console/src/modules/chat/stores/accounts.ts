import { createSignal, untrack } from "solid-js";

import { localStore } from "@/lib/local-store";
import { placementsStore } from "@/modules/environments";

import { chatService } from "../services/chat.service";
import type { AccountsListing, AccountUsage, ProviderAccount } from "../types/chat.types";

// Each machine's answer (by scope): this person's provider accounts there and what each has used.
const [byScope, setByScope] = createSignal<Record<string, AccountsListing>>({});
// Usage changes as agents work; a minute is close enough for rings.
const POLL_MS = 60_000;

localStore.onUserChange(() => setByScope({}));

function put(scope: string, listing: AccountsListing): void {
	setByScope({ ...untrack(byScope), [scope]: listing });
}

export const accountsStore = {
	listing: (scope = ""): AccountsListing | null => byScope()[scope] ?? null,
	/** Whether threads with this agent can run as another account on that machine. */
	supports: (provider: string, scope = ""): boolean =>
		byScope()[scope]?.supported.includes(provider) ?? false,
	/** This person's accounts for one agent on a machine. */
	accounts: (provider: string, scope = ""): ProviderAccount[] =>
		(byScope()[scope]?.accounts ?? []).filter((account) => account.provider === provider),
	/** Every machine's usage, each with the scope it came from. */
	usage: (): (AccountUsage & { scope: string })[] =>
		Object.entries(byScope()).flatMap(([scope, listing]) =>
			listing.usage.map((entry) => ({ ...entry, scope })),
		),
	/** An account's name as its machine knows it. */
	label: (scope: string, id: string | null): string | null =>
		id ? (byScope()[scope]?.accounts.find((account) => account.id === id)?.label ?? null) : null,
	async load(token: string, scope = ""): Promise<void> {
		const started = localStore.version();
		const listing = await chatService.accounts(token, scope);
		if (started === localStore.version()) put(scope, listing);
	},
	/** Keep every machine's usage fresh while the app is visible; returns a stop function. */
	watch(token: () => string | null): () => void {
		let timer: ReturnType<typeof setTimeout> | undefined;
		let stopped = false;
		const tick = async () => {
			const value = token();
			if (value && document.visibilityState === "visible") {
				const scopes = untrack(placementsStore.scopes);
				// A machine that cannot answer (an older runner, one that is off) keeps its last rings.
				await Promise.all(
					scopes.map((scope) => accountsStore.load(value, scope).catch(() => undefined)),
				);
			}
			if (!stopped) timer = setTimeout(() => void tick(), POLL_MS);
		};
		void tick();
		return () => {
			stopped = true;
			clearTimeout(timer);
		};
	},
	async create(
		token: string,
		provider: string,
		label: string,
		scope = "",
	): Promise<ProviderAccount> {
		const account = await chatService.createAccount(token, { provider, label }, scope);
		await accountsStore.load(token, scope);
		return account;
	},
	async rename(token: string, id: string, label: string, scope = ""): Promise<void> {
		await chatService.renameAccount(token, id, label, scope);
		await accountsStore.load(token, scope);
	},
	async remove(token: string, id: string, scope = ""): Promise<void> {
		await chatService.removeAccount(token, id, scope);
		await accountsStore.load(token, scope);
	},
};
