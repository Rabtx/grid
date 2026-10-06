import { createSignal, untrack } from "solid-js";

import { localStore } from "@/lib/local-store";

import { chatService } from "../services/chat.service";
import type { Role, RoleDraft } from "../types/chat.types";

// The team per machine (its runner keeps the roles), read once per visit and kept in step with
// every change made here.
const [byScope, setByScope] = createSignal<Record<string, Role[]>>({});
const loading = new Map<string, Promise<void>>();
let sequence = 0;
const reads = new Map<string, number>();
localStore.onUserChange(() => {
	setByScope({});
	loading.clear();
	reads.clear();
});

function put(scope: string, list: Role[]): void {
	setByScope({ ...untrack(byScope), [scope]: list });
}

export const rolesStore = {
	/** The roles on a machine's team; empty until read, and when there are none. */
	roles: (scope = ""): Role[] => byScope()[scope] ?? [],
	loaded: (scope = ""): boolean => scope in byScope(),
	load(token: string, scope = ""): Promise<void> {
		const running = loading.get(scope);
		if (running) return running;
		const started = localStore.version();
		const request = ++sequence;
		reads.set(scope, request);
		const current = () => started === localStore.version() && reads.get(scope) === request;
		const work = chatService.roles(token, scope).then(
			(list) => {
				if (current()) put(scope, list);
			},
			() => {
				if (!current()) return;
				// An older runner has no roles: the composer offers none rather than failing.
				loading.delete(scope);
				put(scope, []);
			},
		);
		loading.set(scope, work);
		return work;
	},
	/** Read the team again (a teammate may have changed it). */
	reload(token: string, scope = ""): Promise<void> {
		loading.delete(scope);
		return rolesStore.load(token, scope);
	},
	async create(token: string, draft: RoleDraft, scope = ""): Promise<Role> {
		const started = localStore.version();
		const role = await chatService.createRole(token, draft, scope);
		if (started !== localStore.version()) return role;
		put(scope, [
			...untrack(() => rolesStore.roles(scope)).filter((item) => item.id !== role.id),
			role,
		]);
		return role;
	},
	async update(token: string, id: string, patch: Partial<RoleDraft>, scope = ""): Promise<Role> {
		const started = localStore.version();
		const role = await chatService.updateRole(token, id, patch, scope);
		if (started !== localStore.version()) return role;
		put(
			scope,
			untrack(() => rolesStore.roles(scope)).map((item) => (item.id === id ? role : item)),
		);
		return role;
	},
	async remove(token: string, id: string, scope = ""): Promise<void> {
		const started = localStore.version();
		await chatService.removeRole(token, id, scope);
		if (started !== localStore.version()) return;
		put(
			scope,
			untrack(() => rolesStore.roles(scope)).filter((item) => item.id !== id),
		);
	},
};
