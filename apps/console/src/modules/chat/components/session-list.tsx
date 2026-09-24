import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";

import { CloseIcon, PlusIcon } from "@/ui";

import type { ChatProvider, ChatSession } from "../types/chat.types";

/** The agent's initial in a small tile, so chats from different agents read apart. */
export function ProviderMark(props: { provider: string; class?: string }): JSX.Element {
	return (
		<span
			class={`grid shrink-0 place-items-center rounded-[0.25rem] bg-ink/15 font-semibold text-ink/80 text-ui-caption uppercase leading-none ${props.class ?? "size-3.5"}`}
			aria-hidden="true"
		>
			{props.provider.slice(0, 1)}
		</span>
	);
}

/** "Claude Opus 4.6" when the model is known, else the agent's name. */
export function sessionModel(session: ChatSession, providers: ChatProvider[]): string {
	const provider = providers.find((item) => item.id === session.provider);
	const model = provider?.models.find((item) => item.id === session.model);
	if (model) return model.name;
	if (session.model && session.model !== "default") return session.model;
	return provider?.name ?? session.provider;
}

/**
 * The chats open in the title bar, like browser tabs: the current one filled, each closable,
 * and "New chat" while the composer is showing. Phones show only the current one.
 */
export function SessionTabs(props: {
	tabs: ChatSession[];
	activeId: string | null;
	compact: boolean;
	hrefFor: (id: string) => string;
	onClose: (id: string) => void;
}): JSX.Element {
	const visible = () =>
		props.compact ? props.tabs.filter((tab) => tab.id === props.activeId) : props.tabs;

	return (
		<div role="tablist" aria-label="Open chats" class="flex min-w-0 items-center gap-0.5">
			<For each={visible()}>
				{(tab) => (
					<div
						class="group flex h-7 min-w-20 max-w-56 shrink items-center gap-1 rounded-md pr-0.5 pl-2 text-ink/55 hover:bg-ink/6 hover:text-ink aria-selected:bg-selection aria-selected:text-ink pointer-coarse:h-9"
						aria-selected={props.activeId === tab.id ? "true" : "false"}
					>
						<a
							role="tab"
							href={props.hrefFor(tab.id)}
							aria-selected={props.activeId === tab.id ? "true" : "false"}
							class="focus-ring flex min-w-0 items-center gap-1.5 rounded-sm text-ui-sm"
						>
							<ProviderMark provider={tab.provider} />
							<span class="truncate">{tab.title}</span>
						</a>
						<Show when={!props.compact}>
							<button
								type="button"
								aria-label={`Close ${tab.title}`}
								title="Close tab"
								onClick={() => props.onClose(tab.id)}
								class="focus-ring grid size-5 shrink-0 place-items-center rounded-sm text-ink/40 opacity-0 hover:bg-ink/10 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 group-aria-selected:opacity-100"
							>
								<CloseIcon class="size-3" />
							</button>
						</Show>
					</div>
				)}
			</For>
			<Show when={!props.activeId}>
				<div
					role="tab"
					aria-selected="true"
					class="flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-selection px-2 text-ink text-ui-sm pointer-coarse:h-9"
				>
					<PlusIcon class="size-3.5 text-ink/55" />
					New chat
				</div>
			</Show>
		</div>
	);
}
