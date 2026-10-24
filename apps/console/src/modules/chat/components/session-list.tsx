import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import { workspaceHref } from "@/lib/active-workspace";
import {
	ChatIcon,
	CheckIcon,
	Count,
	type HeaderTab,
	HeaderTabs,
	Menu,
	type MenuPoint,
	menuTrigger,
	PlusIcon,
	Shimmer,
	Text,
} from "@/kit";

import { threadsStore } from "../stores/threads";
import type { ChatProvider, ChatSession } from "../types/chat.types";

/** "Claude Opus 4.6" when the model is known, else the agent's name. */
export function sessionModel(session: ChatSession, providers: ChatProvider[]): string {
	const provider = providers.find((item) => item.id === session.provider);
	const model = provider?.models.find((item) => item.id === session.model);
	if (model) return model.name;
	if (session.model && session.model !== "default") return session.model;
	return provider?.name ?? session.provider;
}

/**
 * The chats open in the title bar, like browser tabs: the current one raised, each closable,
 * pinned ones first as their icon, and "New chat" while the composer is showing. A dot marks a
 * thread waiting on you or finished while you were elsewhere. Phones show the current thread's
 * title, which opens the list of open tabs.
 */
export function SessionTabs(props: {
	tabs: ChatSession[];
	pinned: readonly string[];
	activeId: string | null;
	compact: boolean;
	hrefFor: (id: string) => string;
	onClose: (id: string) => void;
	onMenuAt: (id: string, point: MenuPoint) => void;
	onReorder: (id: string, target: string, after: boolean) => void;
	/** Phones: a tab picked from the list (an empty id is a new thread). */
	onPick: (id: string) => void;
}): JSX.Element {
	const active = () => props.tabs.find((tab) => tab.id === props.activeId);
	const attention = (id: string): HeaderTab["attention"] =>
		threadsStore.isWaiting(id) ? "waiting" : threadsStore.isUnseen(id) ? "done" : undefined;
	const elsewhere = () =>
		props.tabs.filter((tab) => tab.id !== props.activeId && attention(tab.id)).length;

	return (
		<Show
			when={!props.compact}
			fallback={
				// Phones: the thread's title in the header, shimmering while it runs; it opens the tabs.
				<Menu
					label="Open tabs"
					title="Open tabs"
					trigger={
						<>
							<Text as="span" tone="strong" weight="medium" truncate>
								<Shimmer active={threadsStore.isRunning(active()?.id ?? "")}>
									{active()?.title ?? "New thread"}
								</Shimmer>
							</Text>
							<Show when={props.tabs.length > 1 || elsewhere()}>
								<Count quiet={!elsewhere()}>{props.tabs.length}</Count>
							</Show>
						</>
					}
					triggerClass={menuTrigger({ width: "fill" })}
					groups={[
						{
							items: props.tabs.map((tab) => ({
								id: tab.id,
								label: tab.title,
								description:
									attention(tab.id) === "waiting"
										? "Waiting on you"
										: attention(tab.id) === "done"
											? "Finished"
											: threadsStore.isRunning(tab.id)
												? "Working"
												: undefined,
								icon: <ChatIcon size="sm" />,
								trailing: tab.id === props.activeId ? <CheckIcon size="sm" /> : undefined,
							})),
						},
						{ items: [{ id: "", label: "New thread", icon: <PlusIcon size="sm" /> }] },
					]}
					onSelect={(id) => props.onPick(id)}
				/>
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
						pinned: props.pinned.includes(tab.id),
						attention: tab.id === props.activeId ? undefined : attention(tab.id),
					})),
					...(props.activeId
						? []
						: [
								{
									id: "new",
									label: "New thread",
									href: workspaceHref(props.hrefFor("")),
									icon: <ChatIcon size="sm" />,
									closable: false,
								},
							]),
				]}
				current={props.activeId ?? "new"}
				onClose={props.onClose}
				onMenuAt={(id, point) => {
					if (id !== "new") props.onMenuAt(id, point);
				}}
				onReorder={props.onReorder}
				newHref={props.activeId ? workspaceHref(props.hrefFor("")) : undefined}
				newLabel="New thread"
			/>
		</Show>
	);
}
