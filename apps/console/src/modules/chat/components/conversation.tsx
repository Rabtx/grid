import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, onSettled, Show, untrack } from "solid-js";

import { onAppResume } from "@/lib/app-resume";
import { quietReconnects } from "@/lib/quiet-reconnects";
import { runnerRestarted, runnerStartedAt } from "@/lib/runner-health";
import { useAuth } from "@/modules/auth";
import { ErrorNotice, FolderIcon } from "@/ui";

import { type ChatConnection, connectChat, type ChatSocket } from "../lib/chat-socket";
import { applyEvent, emptyTranscript, replay, type Transcript } from "../lib/transcript";
import { chatSocketUrl } from "../services/chat.service";
import { threadsStore } from "../stores/threads";
import type { ChatProvider, ChatSession } from "../types/chat.types";

import { mergeModels } from "../lib/choices";

import { Composer } from "./composer";
import { ModelPicker, ModePicker } from "./pickers";
import { TranscriptView } from "./transcript-view";

/** A first message typed on the new-chat screen, sent as soon as the session's socket is up. */
const firstMessages = new Map<string, string>();

export function queueFirstMessage(sessionId: string, text: string): void {
	firstMessages.set(sessionId, text);
}

function shortPath(path: string): string {
	return path.replace(/^\/home\/[^/]+/, "~");
}

/** One conversation: its live transcript and the composer under it. */
export function Conversation(props: {
	id: string;
	/** The machine the chat runs on (`placementsStore`); empty for this one. */
	scope: string;
	providers: ChatProvider[];
	onSession: (session: ChatSession) => void;
}): JSX.Element {
	const auth = useAuth();
	const [transcript, setTranscript] = createSignal<Transcript>(emptyTranscript());
	const [session, setSession] = createSignal<ChatSession | null>(null);
	const [running, setRunning] = createSignal(false);
	// The sidebar and tabs show this thread working the moment its turn starts, not at the next poll.
	createEffect(
		() => [running(), session()?.project] as const,
		([value, project]) => {
			if (project) threadsStore.markRunning(props.id, project, value);
		},
	);
	const [connection, setConnection] = createSignal<ChatConnection>("connecting");
	const [error, setError] = createSignal<string | null>(null);
	const [restartNotice, setRestartNotice] = createSignal<string | null>(null);
	let lastStartedAt = untrack(runnerStartedAt);
	let socket: ChatSocket | undefined;
	let scroller: HTMLDivElement | undefined;
	// Follow new output only while the reader is at the bottom; scrolling up to read stops it.
	let pinned = true;

	const provider = () => props.providers.find((item) => item.id === session()?.provider);
	// The agent's catalog (exact names, effort levels), plus anything it reported live.
	const models = () => mergeModels(provider()?.models ?? [], transcript().models);
	const modes = () => (transcript().modes.length ? transcript().modes : (provider()?.modes ?? []));
	const model = () => transcript().model ?? session()?.model ?? models()[0]?.id ?? "";
	const mode = () => transcript().mode ?? session()?.mode ?? modes()[0]?.id ?? "";
	const currentModel = () => models().find((item) => item.id === model());
	// Live levels from the agent (ACP) win; otherwise the catalog's levels for this model.
	const efforts = () => transcript().efforts ?? currentModel()?.efforts ?? [];
	const effort = () =>
		transcript().effort ?? session()?.effort ?? currentModel()?.defaultEffort ?? null;

	function chooseModel(next: string): void {
		const levels = models().find((item) => item.id === next)?.efforts ?? [];
		const keep = levels.some((level) => level.id === effort());
		const nextEffort =
			levels.length && !keep ? models().find((item) => item.id === next)?.defaultEffort : undefined;
		setTranscript((curr) => ({
			...curr,
			model: next,
			...(nextEffort !== undefined ? { effort: nextEffort } : {}),
		}));
		socket?.send({ t: "configure", model: next, ...(nextEffort ? { effort: nextEffort } : {}) });
	}

	function handleRegenerate(prompt: string): void {
		if (running()) return;
		send(prompt);
	}

	function scrollToEnd(): void {
		requestAnimationFrame(() => {
			if (scroller && pinned) scroller.scrollTop = scroller.scrollHeight;
		});
	}

	onSettled(() => {
		const link = quietReconnects<ChatConnection>(setConnection);
		let attachedBefore = false;
		const live = connectChat({
			url: chatSocketUrl(untrack(() => props.scope)),
			id: props.id,
			token: auth.token,
			renew: auth.renew,
			onReady: (ready) => {
				setSession(ready.session);
				props.onSession(ready.session);
				// Caught up: add what was missed to the transcript as it is, so nothing redraws.
				if (ready.missed) {
					const missed = ready.missed;
					setTranscript((current) => missed.reduce(applyEvent, current));
				} else {
					setTranscript(replay(ready.history));
				}
				const currentStartedAt = runnerStartedAt();
				const restarted =
					runnerRestarted() ||
					(lastStartedAt !== null &&
						currentStartedAt !== null &&
						currentStartedAt !== lastStartedAt);

				if (running() && (restarted || !ready.running)) {
					setRestartNotice("The runner restarted; send again to continue");
					setRunning(false);
				} else {
					setRunning(ready.running);
				}
				lastStartedAt = currentStartedAt;
				// Opening a chat lands on its latest message; coming back to it keeps your place.
				if (!attachedBefore) pinned = true;
				attachedBefore = true;
				scrollToEnd();
				const first = firstMessages.get(props.id);
				if (first && !ready.missed && ready.history.length === 0) {
					firstMessages.delete(props.id);
					live.send({ t: "prompt", text: first });
				}
			},
			onEvent: (event) => {
				setTranscript((current) => applyEvent(current, event));
				// The runner titles a chat from its first message; show that title at once.
				const current = session();
				if (event.type === "user" && current?.title === "New chat") {
					const titled = { ...current, title: event.text.replace(/\s+/g, " ").slice(0, 60) };
					setSession(titled);
					props.onSession(titled);
				}
				if (event.type === "turn_start") {
					setRestartNotice(null);
					setRunning(true);
				}
				if (event.type === "turn_end") setRunning(false);
				scrollToEnd();
			},
			onRunning: setRunning,
			onConnection: link.set,
			visible: () => document.visibilityState === "visible",
			onError: setError,
		});
		socket = live;
		const stopResume = onAppResume(live.reconnectNow);
		// Out of sight, a finished turn or a waiting approval becomes a notification instead.
		const reportVisibility = () => live.setVisible(document.visibilityState === "visible");
		document.addEventListener("visibilitychange", reportVisibility);
		return () => {
			stopResume();
			document.removeEventListener("visibilitychange", reportVisibility);
			link.cancel();
			live.close();
		};
	});

	// A new user message always brings the view back to the bottom.
	createEffect(
		() => transcript().blocks.filter((block) => block.kind === "user").length,
		() => {
			pinned = true;
			scrollToEnd();
		},
	);

	function send(text: string): boolean {
		setError(null);
		setRestartNotice(null);
		if (!socket?.send({ t: "prompt", text })) {
			setError("Not connected to the runner right now — your message is still in the box.");
			return false;
		}
		return true;
	}

	return (
		<div class="flex min-h-0 flex-1 flex-col">
			<Show
				when={
					connection() === "reconnecting" ||
					connection() === "gone" ||
					connection() === "signed-out"
				}
			>
				<output
					aria-live="polite"
					class="block shrink-0 bg-ink/5 px-4 py-1.5 text-ink/60 text-ui-xs"
				>
					{connection() === "reconnecting"
						? "Connection lost — reconnecting…"
						: connection() === "gone"
							? "This chat no longer exists."
							: "Your session ended. Sign in again."}
				</output>
			</Show>
			<div
				ref={(el) => {
					scroller = el;
				}}
				onScroll={(event) => {
					const el = event.currentTarget;
					pinned = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
				}}
				class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 md:px-6"
			>
				<div class="mx-auto w-full max-w-4xl">
					<TranscriptView
						blocks={transcript().blocks}
						running={running()}
						onRegenerate={handleRegenerate}
						onApprove={(id, optionId) => socket?.send({ t: "approve", id, optionId })}
					/>
				</div>
			</div>
			<div class="shrink-0 px-3 pt-1 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6">
				<div class="mx-auto w-full max-w-4xl">
					<Show when={error()}>
						{(message) => (
							<div class="mb-2">
								<ErrorNotice message={message()} />
							</div>
						)}
					</Show>
					<Show when={restartNotice()}>
						{(notice) => (
							<div class="mb-2 rounded-md bg-ink/5 px-3 py-2 text-ink/70 text-ui-xs">
								{notice()}
							</div>
						)}
					</Show>
					<Composer
						running={running()}
						disabled={connection() === "gone" || connection() === "signed-out"}
						onSend={send}
						onStop={() => socket?.send({ t: "cancel" })}
						header={
							<Show when={session()}>
								{(current) => (
									<span class="flex min-w-0 items-center gap-1.5" title={current().cwd}>
										<FolderIcon class="size-3.5 shrink-0" />
										<span class="truncate">{shortPath(current().cwd)}</span>
									</span>
								)}
							</Show>
						}
						controls={
							<>
								<Show when={models().length > 0}>
									<ModelPicker
										agent={session()?.provider}
										models={models()}
										model={model()}
										onModel={chooseModel}
										efforts={efforts()}
										effort={effort()}
										onEffort={(next) => socket?.send({ t: "configure", effort: next })}
									/>
								</Show>
								<Show when={modes().length > 0}>
									<ModePicker
										modes={modes()}
										mode={mode()}
										onMode={(next) => socket?.send({ t: "configure", mode: next })}
									/>
								</Show>
								<Show when={transcript().usage?.contextWindow}>
									<span
										class="shrink-0 px-1 text-ink/40 text-ui-caption tabular-nums"
										title="Context used"
									>
										{Math.round(
											((transcript().usage?.contextUsed ?? 0) /
												(transcript().usage?.contextWindow ?? 1)) *
												100,
										)}
										%
									</span>
								</Show>
							</>
						}
					/>
				</div>
			</div>
		</div>
	);
}
