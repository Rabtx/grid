import { createSignal, untrack } from "solid-js";

import { chatService } from "../services/chat.service";
import type { Role, RoleDraft } from "../types/chat.types";

// The team per machine (its runner keeps the roles), read once per visit and kept in step with
// every change made here.
const [byScope, setByScope] = createSignal<Record<string, Role[]>>({});
const loading = new Map<string, Promise<void>>();

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
		const work = chatService.roles(token, scope).then(
			(list) => put(scope, list),
			() => {
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
		const role = await chatService.createRole(token, draft, scope);
		put(scope, [
			...untrack(() => rolesStore.roles(scope)).filter((item) => item.id !== role.id),
			role,
		]);
		return role;
	},
	async update(token: string, id: string, patch: Partial<RoleDraft>, scope = ""): Promise<Role> {
		const role = await chatService.updateRole(token, id, patch, scope);
		put(
			scope,
			untrack(() => rolesStore.roles(scope)).map((item) => (item.id === id ? role : item)),
		);
		return role;
	},
	async remove(token: string, id: string, scope = ""): Promise<void> {
		await chatService.removeRole(token, id, scope);
		put(
			scope,
			untrack(() => rolesStore.roles(scope)).filter((item) => item.id !== id),
		);
	},
};
