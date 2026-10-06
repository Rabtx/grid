import { useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, createSignal, For, onSettled, Show, untrack } from "solid-js";

import { onAppResume } from "@/lib/app-resume";
import { localStore, saveSoon } from "@/lib/local-store";
import { linkFor } from "@/lib/runner-link";
import { quietReconnects } from "@/lib/quiet-reconnects";
import { runnerRestarted, runnerStartedAt } from "@/lib/runner-health";
import { useAuth } from "@/modules/auth";
import { environmentsStore } from "@/modules/environments";
import { placementsStore } from "@/modules/environments/stores/placements";
import { relativeTime } from "@/modules/projects/lib/relative-time";
import { ShellSlot, useShell } from "@/modules/shell";
import { notesStore, useWorkspace } from "@/modules/projects";
import {
	AgentLogo,
	Alert,
	Badge,
	Banner,
	BranchIcon,
	Button,
	ChevronDownIcon,
	ClockIcon,
	ContextMeter,
	DetailAside,
	DiffStat,
	FactGroup,
	LaptopIcon,
	RoleMark,
	ScrollRail,
	ThreadHeader,
	notify,
	type PopoverControl,
	Text,
} from "@/kit";

import { type ChatConnection, connectChat, type ChatSocket } from "../lib/chat-socket";
import { threadFacts } from "../lib/thread-facts";
import {
	applyEvent,
	emptyTranscript,
	formatDuration,
	pendingApprovals,
	replay,
	type Transcript,
} from "../lib/transcript";
import { chatService, chatSocketUrl } from "../services/chat.service";
import { threadsStore } from "../stores/threads";
import type { ChatEvent, ChatProvider, ChatSession } from "../types/chat.types";

import { mergeModels } from "../lib/choices";
import { addBoardTask, runSlashCommand } from "../lib/run-slash-command";
import { agentCommands, availableCommands, type SlashCommand } from "../lib/slash-commands";

import { Composer } from "./composer";
import { GitControl } from "./git-control";
import { ModelPicker, ModePicker } from "./pickers";
import {
	ApprovalCard,
	type ThreadPeople,
	TranscriptView,
	type UserPrompt,
} from "./transcript-view";

/** A first message typed on the new-chat screen, sent as soon as the session's socket is up. */
const firstMessages = new Map<string, { text: string; attachments: string[] }>();

export function queueFirstMessage(
	sessionId: string,
	text: string,
	attachments: string[] = [],
): void {
	firstMessages.set(sessionId, { text, attachments });
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
	const shell = useShell();
	const workspace = useWorkspace();
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
	let modelPicker: PopoverControl | undefined;
	let modePicker: PopoverControl | undefined;
	// Follow new output only while the reader is at the bottom; scrolling up to read stops it.
	let pinned = true;
	const [isPinned, setIsPinned] = createSignal(true);
	const setPinned = (value: boolean) => {
		pinned = value;
		setIsPinned(value);
	};

	const provider = () => props.providers.find((item) => item.id === session()?.provider);
	// Where the thread works: the thread list's copy is kept current (a worktree removed from
	// its menu), the one this screen opened with is not.
	const place = () => {
		const current = session();
		if (!current) return null;
		return threadsStore.threads(current.project).find((item) => item.id === current.id) ?? current;
	};
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

	// "Add as note": the message goes to the project's notes, marked with the agent and chat.
	const navigate = useNavigate();
	async function saveNote(text: string): Promise<void> {
		const token = auth.token();
		const current = session();
		if (!token || !current) {
			notify({
				title: token ? "Open a thread to add notes" : "Sign in to add notes",
				tone: "danger",
			});
			return;
		}
		const agent = provider()?.name;
		try {
			const note = await notesStore.add(token, current.project, {
				body: text,
				source: agent ? `${agent} in ${current.title}` : current.title,
				threadId: current.id,
			});
			notify({
				title: "Added to notes",
				tone: "success",
				action: { label: "Open", run: () => navigate(`/notes/${current.project}/${note.id}`) },
			});
		} catch (cause) {
			notify({
				title: cause instanceof Error ? cause.message : "Could not add the note",
				tone: "danger",
			});
		}
	}

	// Slash commands: which apply here, what each one does, and what the agent itself offers.
	// An agent that has not said, or does not have any, adds nothing.
	const commands = () =>
		availableCommands(
			{
				running: running(),
				models: models().length > 0,
				modes: modes().length > 0,
				efforts: efforts().length > 0,
				project: Boolean(session()?.project),
			},
			agentCommands(transcript().commands, {
				id: session()?.provider ?? "",
				name: provider()?.name ?? session()?.provider ?? "",
			}),
		);

	function runCommand(command: SlashCommand, argument: string): boolean {
		const slug = session()?.project;
		return runSlashCommand(command, argument, {
			running: running(),
			// Always offered here: before the thread has loaded there is no project to open one in.
			newThread: () =>
				slug
					? navigate(`/chat/${slug}`)
					: notify({ title: "This thread is still loading", tone: "danger" }),
			openModel: modelPicker?.open,
			openMode: modePicker?.open,
			efforts: efforts(),
			setEffort:
				socket && connection() === "open"
					? (id) => socket?.send({ t: "configure", effort: id })
					: undefined,
			stop: () => socket?.send({ t: "cancel" }),
			addTask: slug
				? (title) => void addBoardTask({ token: auth.token(), project: slug, title, workspace })
				: undefined,
			addNote: slug ? (text) => void saveNote(text) : undefined,
		});
	}

	function handleRegenerate(prompt: UserPrompt): void {
		if (running()) return;
		void send(prompt.text, [], prompt.attachments).catch((cause) =>
			setError(cause instanceof Error ? cause.message : "Could not send message"),
		);
	}

	function scrollToEnd(): void {
		requestAnimationFrame(() => {
			if (scroller && pinned) scroller.scrollTop = scroller.scrollHeight;
		});
	}

	onSettled(() => {
		const link = quietReconnects<ChatConnection>(setConnection);
		let attachedBefore = false;
		let disposed = false;
		let live: ChatSocket | null = null;
		let stopResume = () => {};
		// The events this transcript is built from, kept on the device with where this device got
		// to: the chat shows at once next time, and the runner sends only what is new.
		let log: ChatEvent[] = [];
		const cacheKey = `chat:${props.id}`;
		const saver = saveSoon(cacheKey, () => ({ events: log, cursor: live?.cursor() ?? null }));

		const connect = (cursor: { epoch: string; next: number } | null) => {
			const chat = connectChat({
				cursor,
				url: chatSocketUrl(untrack(() => props.scope)),
				// One connection per machine, shared with every other open chat and terminal on it.
				createSocket: (url) =>
					linkFor(
						untrack(() => props.scope),
						auth.token,
					).socket("chat", url) as unknown as WebSocket,
				id: props.id,
				token: auth.token,
				renew: auth.renew,
				onReady: (ready) => {
					setSession(ready.session);
					props.onSession(ready.session);
					// Caught up: add what was missed to the transcript as it is, so nothing redraws.
					if (ready.missed) {
						const missed = ready.missed;
						log = [...log, ...missed];
						setTranscript((current) => missed.reduce(applyEvent, current));
					} else {
						log = [...ready.history];
						// The list arrived with this attach, before `ready`; the rebuild is the
						// conversation, so it must not take the list with it.
						setTranscript((current) => ({
							...replay(ready.history),
							commands: current.commands,
						}));
					}
					saver.schedule();
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
					if (!attachedBefore) setPinned(true);
					attachedBefore = true;
					scrollToEnd();
					const first = firstMessages.get(props.id);
					if (first && !ready.missed && ready.history.length === 0) {
						firstMessages.delete(props.id);
						chat.send({ t: "prompt", ...first });
					}
				},
				onEvent: (event) => {
					// The agent's command list is not conversation: it comes again on every attach,
					// so it is not worth keeping with the log.
					if (event.type === "commands") {
						setTranscript((current) => applyEvent(current, event));
						return;
					}
					log.push(event);
					saver.schedule();
					setTranscript((current) => applyEvent(current, event));
					// The runner titles a chat from its first message; show that title at once.
					const current = session();
					if (event.type === "user" && current?.title === "New chat") {
						const title = event.text || event.attachments?.[0]?.name || "Chat";
						const titled = { ...current, title: title.replace(/\s+/g, " ").slice(0, 60) };
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
			live = chat;
			socket = chat;
			stopResume = onAppResume(chat.reconnectNow);
		};

		// What this device kept first, then the live link from where it got to.
		void localStore
			.get<{ events: ChatEvent[]; cursor: { epoch: string; next: number } | null }>(cacheKey)
			.then((kept) => {
				if (disposed) return;
				if (kept?.events?.length) {
					log = kept.events;
					setTranscript(replay(log));
					setPinned(true);
					scrollToEnd();
				}
				// Opening the app: connect once the session is confirmed (signed out, not at all).
				void auth.waitForToken().then((token) => {
					if (token && !disposed) connect(kept?.cursor ?? null);
				});
			});

		// Out of sight, a finished turn or a waiting approval becomes a notification instead; and
		// the transcript is saved now, in case the phone closes the app while it is hidden.
		const reportVisibility = () => {
			const visible = document.visibilityState === "visible";
			live?.setVisible(visible);
			if (!visible) saver.flush();
		};
		document.addEventListener("visibilitychange", reportVisibility);
		return () => {
			disposed = true;
			saver.flush();
			stopResume();
			document.removeEventListener("visibilitychange", reportVisibility);
			link.cancel();
			live?.close();
		};
	});

	// A new user message always brings the view back to the bottom.
	createEffect(
		() => transcript().blocks.filter((block) => block.kind === "user").length,
		() => {
			setPinned(true);
			scrollToEnd();
		},
	);

	/** Sends a message with new files and, for Regenerate, files the thread already holds. */
	async function send(text: string, files: File[] = [], existing: string[] = []): Promise<boolean> {
		const token = auth.token();
		if (!token || connection() !== "open") {
			setError("Not connected to the runner right now — your message is still in the box.");
			return false;
		}
		const attachments = await chatService.upload(token, props.id, files, props.scope);
		setError(null);
		setRestartNotice(null);
		const ids = [...existing, ...attachments.map((item) => item.id)];
		if (!socket?.send({ t: "prompt", text, attachments: ids })) {
			setError("Not connected to the runner right now — your message is still in the box.");
			return false;
		}
		return true;
	}

	const facts = createMemo(() => threadFacts(transcript().blocks));
	// What the agent is waiting on, docked over the composer where the answer is given.
	const waitingOn = createMemo(() => pendingApprovals(transcript()));
	const subtitle = () =>
		[
			facts().files.length
				? `${facts().files.length} file${facts().files.length === 1 ? "" : "s"} changed`
				: null,
			facts().waiting ? "Needs approval" : running() ? "Working" : null,
		]
			.filter(Boolean)
			.join(" · ");
	const modelName = () => currentModel()?.name ?? (model() || undefined);
	const machine = () =>
		environmentsStore.labelOf(placementsStore.environmentOf(session()?.project)) ?? "This machine";
	const status = () =>
		facts().waiting ? (
			<Badge tone="warning" dot>
				Needs approval
			</Badge>
		) : running() ? (
			<Badge tone="accent" dot>
				Working
			</Badge>
		) : facts().failed ? (
			<Badge tone="danger" dot>
				Failed
			</Badge>
		) : undefined;
	const people = (): ThreadPeople | undefined => {
		const current = session();
		if (!current) return undefined;
		return {
			agentId: current.provider,
			agentName: provider()?.name ?? current.provider,
			model: modelName(),
			you: auth.user()?.username ?? "You",
		};
	};

	return (
		<div class="flex min-h-0 flex-1">
			<div class="flex min-h-0 min-w-0 flex-1 flex-col">
				<Show when={subtitle()}>
					<ShellSlot name="subtitle">{subtitle()}</ShellSlot>
				</Show>
				<Show
					when={
						connection() === "reconnecting" ||
						connection() === "gone" ||
						connection() === "signed-out"
					}
				>
					<Banner tone="quiet">
						{connection() === "reconnecting"
							? "Connection lost — reconnecting…"
							: connection() === "gone"
								? "This chat no longer exists."
								: "Your session ended. Sign in again."}
					</Banner>
				</Show>
				<div class="relative flex min-h-0 flex-1 flex-col">
					<div
						ref={(el) => {
							scroller = el;
						}}
						onScroll={(event) => {
							const el = event.currentTarget;
							setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 48);
						}}
						class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 md:px-6"
					>
						<div class="mx-auto flex w-full max-w-160 flex-col gap-6">
							<Show when={session()}>
								{(current) => (
									<div class="hidden md:block">
										<ThreadHeader
											title={current().title}
											status={status()}
											facts={[
												...(current().role
													? [
															{
																icon: <RoleMark icon={current().role?.icon ?? "code"} size="sm" />,
																label: current().role?.name ?? "",
															},
														]
													: []),
												...(place()?.worktree
													? [{ icon: <BranchIcon />, label: place()?.worktree?.branch ?? "" }]
													: []),
												{ icon: <LaptopIcon />, label: machine() },
												{
													icon: (
														<AgentLogo id={current().provider} name={people()?.agentName ?? ""} />
													),
													label: [people()?.agentName, modelName()].filter(Boolean).join(" · "),
												},
												{
													icon: <ClockIcon />,
													label: `Started ${relativeTime(current().createdAt)}`,
												},
											]}
										/>
									</div>
								)}
							</Show>
							<TranscriptView
								people={people()}
								loadAttachment={(id, signal) =>
									chatService.attachment(auth.token() ?? "", props.id, id, props.scope, signal)
								}
								blocks={transcript().blocks}
								running={running()}
								onRegenerate={handleRegenerate}
								onNote={(text) => void saveNote(text)}
								onApprove={(id, optionId) => socket?.send({ t: "approve", id, optionId })}
							/>
						</div>
					</div>
					<ScrollRail scroller={() => scroller} />
					<Show when={!isPinned()}>
						<Button
							variant="secondary"
							size="sm"
							icon={<ChevronDownIcon size="sm" />}
							onClick={() => {
								setPinned(true);
								scroller?.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
							}}
							class="absolute bottom-3 right-4 z-20 md:right-8"
							aria-label="Scroll to latest messages"
						>
							Latest
						</Button>
					</Show>
				</div>
				<div class="shrink-0 px-3 pt-1 pb-safe md:px-6 md:pb-4">
					<div class="mx-auto w-full max-w-160">
						<Show when={error()}>
							{(message) => (
								<div class="mb-2">
									<Alert tone="danger" title={message()} />
								</div>
							)}
						</Show>
						<Show when={restartNotice()}>
							{(notice) => (
								<div class="mb-2">
									<Alert tone="accent" title={notice()} />
								</div>
							)}
						</Show>
						<For each={waitingOn()}>
							{(approval) => (
								<div class="mb-2">
									<ApprovalCard
										approval={approval}
										onApprove={(id, optionId) => socket?.send({ t: "approve", id, optionId })}
									/>
								</div>
							)}
						</For>
						<Composer
							project={session()?.project}
							running={running()}
							commands={commands()}
							onCommand={runCommand}
							disabled={connection() === "gone" || connection() === "signed-out"}
							onSend={send}
							onStop={() => socket?.send({ t: "cancel" })}
							header={
								<Show when={place()}>
									{(current) => (
										<>
											<GitControl
												folder={current().cwd}
												scope={placementsStore.scopeOf(current().project)}
												inWorktree={Boolean(current().worktree)}
											/>
										</>
									)}
								</Show>
							}
							controls={
								<>
									<Show when={models().length > 0}>
										<ModelPicker
											agent={session()?.provider}
											agentName={provider()?.name}
											models={models()}
											model={model()}
											onModel={chooseModel}
											efforts={efforts()}
											effort={effort()}
											onEffort={(next) => socket?.send({ t: "configure", effort: next })}
											control={(control) => {
												modelPicker = control;
											}}
										/>
									</Show>
									<Show when={modes().length > 0}>
										<ModePicker
											modes={modes()}
											mode={mode()}
											onMode={(next) => socket?.send({ t: "configure", mode: next })}
											control={(control) => {
												modePicker = control;
											}}
										/>
									</Show>
									<Show when={transcript().usage?.contextWindow}>
										{(total) => (
											<ContextMeter used={transcript().usage?.contextUsed ?? 0} total={total()} />
										)}
									</Show>
								</>
							}
						/>
					</div>
				</div>
			</div>
			<Show when={session()}>
				{(current) => (
					<DetailAside label="Run" floating={shell.floating()}>
						<FactGroup
							label="Run"
							rows={[
								{ label: "Agent", value: people()?.agentName ?? current().provider },
								...(modelName() ? [{ label: "Model", value: modelName() }] : []),
								...(place()?.worktree
									? [{ label: "Branch", value: place()?.worktree?.branch ?? "" }]
									: []),
								{ label: "Machine", value: machine() },
								...(facts().workedMs > 0
									? [{ label: "Time", value: formatDuration(facts().workedMs) }]
									: []),
							]}
						/>
						<FactGroup label="Changes">
							<Show
								when={facts().files.length > 0}
								fallback={
									<Text size="caption" tone="subtle">
										No files changed yet.
									</Text>
								}
							>
								<p class="flex items-center gap-2 text-body text-fg">
									{facts().files.length} file{facts().files.length === 1 ? "" : "s"} changed
									<DiffStat added={facts().added} removed={facts().removed} />
								</p>
								<ul class="flex flex-col gap-1">
									<For each={facts().files}>
										{(file) => (
											<li class="flex items-center gap-2 text-caption">
												<span
													class="min-w-0 flex-1 truncate font-mono text-fg-muted"
													title={file.path}
												>
													{file.path.split("/").slice(-2).join("/")}
												</span>
												<DiffStat added={file.added} removed={file.removed} />
											</li>
										)}
									</For>
								</ul>
							</Show>
						</FactGroup>
					</DetailAside>
				)}
			</Show>
		</div>
	);
}
