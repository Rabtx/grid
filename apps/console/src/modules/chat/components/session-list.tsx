import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import { workspaceHref } from "@/lib/active-workspace";
import { AgentMark, ChatIcon, EditIcon, HeaderTabs, Shimmer, Text } from "@/kit";

import { threadsStore } from "../stores/threads";
import type { ChatProvider, ChatSession } from "../types/chat.types";

/** The agent's initial in a small tile (the kit's AgentMark), for the model pickers. */
export function ProviderMark(props: { provider: string; class?: string }): JSX.Element {
	return <AgentMark name={props.provider} size={props.class === "size-4" ? "md" : "sm"} />;
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
 * The chats open in the title bar, like browser tabs: the current one raised, each closable, and
 * "New chat" while the composer is showing. Phones show only the current thread's title.
 */
export function SessionTabs(props: {
	tabs: ChatSession[];
	activeId: string | null;
	compact: boolean;
	hrefFor: (id: string) => string;
	onClose: (id: string) => void;
}): JSX.Element {
	const active = () => props.tabs.find((tab) => tab.id === props.activeId);

	return (
		<Show
			when={!props.compact}
			fallback={
				// Phones: just the thread's title in the header — no tab, no chrome — shimmering while it runs.
				<Text as="h1" tone="strong" weight="medium" truncate>
					<Shimmer active={threadsStore.isRunning(active()?.id ?? "")}>
						{active()?.title ?? "New chat"}
					</Shimmer>
				</Text>
			}
		>
			<HeaderTabs
				tabs={[
					...props.tabs.map((tab) => ({
						id: tab.id,
						label: tab.title,
						href: workspaceHref(props.hrefFor(tab.id)),
						icon: <ChatIcon size="sm" />,
						running: threadsStore.isRunning(tab.id),
					})),
					...(props.activeId
						? []
						: [
								{
									id: "new",
									label: "New chat",
									href: workspaceHref(props.hrefFor("")),
									icon: <EditIcon size="sm" />,
									closable: false,
								},
							]),
				]}
				current={props.activeId ?? "new"}
				onClose={props.onClose}
			/>
		</Show>
	);
}
