import { useLocation, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";

import { AgentLogo, Button, NotificationCard, NotificationStack, notify } from "@/kit";
import { now } from "@/lib/clock";
import { useAuth } from "@/modules/auth";
import { agentName } from "@/modules/chat/stores/providers";
import { INBOX_KINDS, type InboxItem } from "@/modules/inbox";
import { useWorkspaces } from "@/modules/workspaces";
import { mayDo } from "@/modules/workspaces/lib/members";
import { useShell } from "@/modules/shell";

import { approvalLine, ARRIVAL_TITLE, since } from "../lib/words";
import { attentionStore, type WaitingHere } from "../stores/attention";

function message(cause: unknown, fallback: string): string {
	return cause instanceof Error ? cause.message : fallback;
}

/**
 * Notifications in the app (Figma 26): an agent asking to run something in a thread you are not
 * looking at, answerable here with Allow or Deny, and what newly arrived in the Inbox — a run that
 * finished or failed, a pull request ready. Desktop stacks a few at the bottom right; a phone
 * shows the newest as a banner at the top.
 */
export function AttentionNotifications(): JSX.Element {
	const auth = useAuth();
	const workspaces = useWorkspaces();
	const mayAnswer = () => {
		const current = workspaces.current();
		return current
			? mayDo("approveCommands", current.role, current.customRole, current.settings)
			: false;
	};
	const shell = useShell();
	const location = useLocation();
	const navigate = useNavigate();
	const [answering, setAnswering] = createSignal<string | null>(null);

	createEffect(
		() => auth.token(),
		(token) => (token ? attentionStore.start(token) : undefined),
	);

	// The thread open now shows its own approval over the composer.
	const viewing = () => /^\/chat\/[^/]+\/([\w-]+)/.exec(location.pathname)?.[1] ?? null;
	const approvals = createMemo(() =>
		attentionStore
			.waiting()
			.filter((item) => item.sessionId !== viewing() && !attentionStore.hidden().has(item.key))
			.sort((a, b) => b.since - a.since),
	);
	const room = () => (shell.desktop() ? 3 : 1);
	const shownApprovals = () => approvals().slice(0, room());
	const shownArrivals = () =>
		attentionStore.arrivals().slice(0, Math.max(0, room() - shownApprovals().length));

	async function answer(item: WaitingHere, optionId: string): Promise<void> {
		const token = auth.token();
		if (!token || !mayAnswer() || answering()) return;
		setAnswering(item.key);
		try {
			await attentionStore.answer(token, item, optionId);
		} catch (cause) {
			notify({ title: message(cause, "Could not answer the agent"), tone: "danger" });
		} finally {
			setAnswering(null);
		}
	}

	const openThread = (item: WaitingHere) => {
		attentionStore.hide(item.key);
		navigate(`/chat/${item.project}/${item.sessionId}`);
	};

	const approvalCard = (item: WaitingHere) => {
		const allow = () =>
			item.approval.options.find((option) => option.kind === "allow") ??
			item.approval.options.find((option) => option.kind === "allow_always");
		const deny = () => item.approval.options.find((option) => option.kind === "deny");
		return (
			<NotificationCard
				icon={<AgentLogo id={item.provider} name={agentName(item.provider)} />}
				title={`${agentName(item.provider)} needs you`}
				body={`${approvalLine(item.approval.title)} in ${item.project} · ${item.thread}`}
				time={since(item.since, now())}
				onDismiss={() => attentionStore.hide(item.key)}
				actions={
					<>
						<Show when={mayAnswer() ? allow() : null}>
							{(option) => (
								<Button
									size="sm"
									variant="primary"
									disabled={answering() !== null}
									onClick={() => void answer(item, option().id)}
								>
									{option().label || "Allow"}
								</Button>
							)}
						</Show>
						<Show when={mayAnswer() ? deny() : null}>
							{(option) => (
								<Button
									size="sm"
									disabled={answering() !== null}
									onClick={() => void answer(item, option().id)}
								>
									{option().label || "Deny"}
								</Button>
							)}
						</Show>
						<Button size="sm" variant="ghost" onClick={() => openThread(item)}>
							Open
						</Button>
					</>
				}
			/>
		);
	};

	const arrivalCard = (item: InboxItem) => (
		<Show when={item.kind !== "approval"}>
			<NotificationCard
				icon={INBOX_KINDS[item.kind].icon()}
				title={ARRIVAL_TITLE[item.kind as Exclude<InboxItem["kind"], "approval">]}
				body={[item.title, item.body].filter(Boolean).join(" · ")}
				time="now"
				onDismiss={() => attentionStore.dropArrival(item.id)}
				actions={
					<Button
						size="sm"
						variant="ghost"
						onClick={() => {
							attentionStore.dropArrival(item.id);
							navigate(item.url);
						}}
					>
						{INBOX_KINDS[item.kind].open}
					</Button>
				}
			/>
		</Show>
	);

	return (
		<Show when={shownApprovals().length || shownArrivals().length}>
			<NotificationStack>
				<For each={shownApprovals()} keyed={(item) => item.key}>
					{(item) => approvalCard(item())}
				</For>
				<For each={shownArrivals()} keyed={(item) => item.id}>
					{(item) => arrivalCard(item())}
				</For>
			</NotificationStack>
		</Show>
	);
}
