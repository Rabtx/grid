import type { JSX } from "@solidjs/web";
import { createMemo, For, onSettled, Show } from "solid-js";

import { AgentLogo, UsageRing, UsageStrip } from "@/kit";
import { useAuth } from "@/modules/auth";

import { accountsStore } from "../stores/accounts";
import { providersStore } from "../stores/providers";
import type { UsageLimit } from "../types/chat.types";

// The windows worth a ring: a plan's own two, then any per-model one.
const MAX_RINGS = 3;

/** "in 2h 10m", "in 3d": how long until a window resets. */
function until(iso: string, now: number): string {
	const minutes = Math.max(0, Math.round((Date.parse(iso) - now) / 60_000));
	if (minutes < 60) return `in ${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 48) return `in ${hours}h ${minutes % 60}m`;
	return `in ${Math.round(hours / 24)}d`;
}

export function limitDetail(limit: UsageLimit, now = Date.now()): string {
	const used = limit.limited
		? "Used up"
		: limit.usedPercent === null
			? "Allowed"
			: `${Math.round(limit.usedPercent)}% used`;
	return limit.resetsAt ? `${used} · resets ${until(limit.resetsAt, now)}` : used;
}

/**
 * How much of each agent account's plan is used, as the agents last said: one strip per account,
 * a ring per window (5h, Weekly). At the foot of the sidebar; nothing shows until an agent has
 * reported its limits.
 */
export function UsageRings(): JSX.Element {
	const auth = useAuth();
	onSettled(() => accountsStore.watch(auth.token));

	const entries = createMemo(() =>
		accountsStore.usage().filter((entry) => entry.limits.length > 0),
	);
	const agentName = (provider: string, scope: string) =>
		providersStore.providers(scope).find((item) => item.id === provider)?.name ??
		provider.charAt(0).toUpperCase() + provider.slice(1);

	return (
		<Show when={entries().length}>
			<section aria-label="Agent usage" class="flex flex-col border-line border-t px-1 py-1.5">
				<For each={entries()}>
					{(entry) => (
						<UsageStrip
							mark={<AgentLogo id={entry.provider} name={agentName(entry.provider, entry.scope)} />}
							name={agentName(entry.provider, entry.scope)}
							detail={
								accountsStore.label(entry.scope, entry.account) ??
								(entry.scope ? "Another machine" : "This machine")
							}
						>
							<For each={entry.limits.slice(0, MAX_RINGS)}>
								{(limit) => (
									<UsageRing
										window={limit.window}
										used={limit.usedPercent}
										limited={limit.limited}
										detail={limitDetail(limit)}
									/>
								)}
							</For>
						</UsageStrip>
					)}
				</For>
			</section>
		</Show>
	);
}
