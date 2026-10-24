import { useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import {
	createEffect,
	createMemo,
	createSignal,
	flush,
	For,
	onSettled,
	Show,
	untrack,
} from "solid-js";

import { onAppResume } from "@/lib/app-resume";
import { useCommand } from "@/lib/keybindings";
import { localStore, saveSoon } from "@/lib/local-store";
import { linkFor } from "@/lib/runner-link";
import { quietReconnects } from "@/lib/quiet-reconnects";
import { runnerStartedAt } from "@/lib/runner-health";
import { useAuth } from "@/modules/auth";
import { environmentsStore } from "@/modules/environments";
import { placementsStore } from "@/modules/environments/stores/placements";
import { relativeTime } from "@/modules/projects/lib/relative-time";
import { ShellSlot, useShell } from "@/modules/shell";
import { notesStore, useWorkspace } from "@/modules/projects";
import {
	DockedWorkspace,
	layoutsStore,
	openTab,
	SplitFrame,
	SplitSwitch,
	toggleTab,
	type WorkspaceProps,
	WorkspaceToggle,
} from "@/modules/split";
import {
	AgentLogo,
	Alert,
	Badge,
	Banner,
	BranchIcon,
	Button,
	ChatIcon,
	ChevronDownIcon,
	ClockIcon,
	ConfirmDialog,
	CrewPanel,
	ContextMeter,
	DetailAside,
	DiffStat,
	FactGroup,
	IconButton,
	LaptopIcon,
	RoleMark,
	ScrollRail,
	ThreadHeader,
	notify,
	type PopoverControl,
	QuestionCard,
	QueueList,
	SubagentStrip,
	Text,
} from "@/kit";

import { type ChatConnection, connectChat, type ChatSocket } from "../lib/chat-socket";
import { threadFacts } from "../lib/thread-facts";
import {
	applyEvent,
	emptyTranscript,
	formatDuration,
	pendingApprovals,
	pendingQuestions,
	replay,
	runningSubagents,
	type Transcript,
} from "../lib/transcript";
import { chatService, chatSocketUrl } from "../services/chat.service";
import { threadsStore } from "../stores/threads";
import type {
	ChatEvent,
	ChatProvider,
	ChatSession,
	Crew,
	FileDiff,
	WaitingApproval,
} from "../types/chat.types";

import { mergeModels } from "../lib/choices";
import { addBoardTask, runSlashCommand } from "../lib/run-slash-command";
import { agentCommands, availableCommands, type SlashCommand } from "../lib/slash-commands";

import { Composer } from "./composer";
import { CrewSettingsDialog } from "./crew-settings";
import { GitControl } from "./git-control";
import { ModelPicker, ModePicker } from "./pickers";
import {
	ApprovalCard,
	type ThreadPeople,
	TranscriptView,
	type UserPrompt,
} from "./transcript-view";

/** How often an open crew's members are read again. */
const CREW_POLL_MS = 5_000;

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
	/** Drawn inside another thread's workspace (a side chat): the conversation alone, no chrome. */
	embedded?: boolean;
}): JSX.Element {
	const embedded = untrack(() => props.embedded === true);
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
	// Opening a thread brings its latest messages; earlier ones load a page at a time on scrolling
	// up. `earlier` is where the next page ends, null once the start of the thread is here.
	let earlier: number | null = null;
	const [hasEarlier, setHasEarlier] = createSignal(false);
	const [loadingEarlier, setLoadingEarlier] = createSignal(false);
	// Messages that arrived from earlier pages: not new ones, so they must not jump to the end.
	const [olderMessages, setOlderMessages] = createSignal(0);
	const setEarlier = (value: number | null) => {
		earlier = value;
		setHasEarlier(value !== null);
	};
	let loadEarlier = async (): Promise<void> => {};
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
				split: Boolean(session()),
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
			openSplit: () =>
				layoutsStore.update(props.id, (layout) => openTab(layout, { kind: "terminal" })),
			fork: (worktree) => void fork(undefined, worktree),
			side: (agent) => {
				const named = agent.trim() ? agentNamed(agent) : undefined;
				if (agent.trim() && !named) return false;
				void openSide(named?.id);
				return true;
			},
			handoff: (agent, newThread) => {
				const named = agentNamed(agent);
				if (!named) return false;
				void handoff(named.id, newThread);
				return true;
			},
		});
	}

	function handleRegenerate(prompt: UserPrompt): void {
		if (running()) return;
		void send(prompt.text, [], false, prompt.attachments).catch((cause) =>
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
		const saver = saveSoon(cacheKey, () => ({
			events: log,
			cursor: live?.cursor() ?? null,
			earlier,
		}));

		loadEarlier = async () => {
			const token = auth.token();
			const before = earlier;
			if (!token || before === null || untrack(loadingEarlier)) return;
			setLoadingEarlier(true);
			try {
				const page = await chatService.earlierEvents(
					token,
					props.id,
					before,
					untrack(() => props.scope),
				);
				if (disposed || earlier !== before) return;
				// Kept in place: what the reader was looking at stays put as the page goes in above.
				const fromBottom = scroller ? scroller.scrollHeight - scroller.scrollTop : 0;
				log = [...page.events, ...log];
				setOlderMessages(
					(count) => count + page.events.filter((event) => event.type === "user").length,
				);
				setTranscript((current) => ({
					...replay(log),
					commands: current.commands,
					queue: current.queue,
				}));
				setEarlier(page.earlier);
				saver.schedule();
				// Drawn now rather than next frame, so the page never shows jumped for a frame.
				flush();
				if (scroller) scroller.scrollTop = scroller.scrollHeight - fromBottom;
			} catch (cause) {
				setError(cause instanceof Error ? cause.message : "Could not load earlier messages");
			} finally {
				setLoadingEarlier(false);
			}
		};

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
						setEarlier(ready.earlier);
						setOlderMessages(0);
						// The list arrived with this attach, before `ready`; the rebuild is the
						// conversation, so it must not take the list with it.
						setTranscript((current) => ({
							...replay(ready.history),
							commands: current.commands,
							queue: current.queue,
						}));
					}
					saver.schedule();
					const currentStartedAt = runnerStartedAt();
					// A restart seen between two attaches of this conversation means the turn that
					// was running is not the one that is. This is scoped to the view on purpose: the
					// runner's own answer is the truth about what is running now, and it is right
					// whether or not the runner restarted. Trusting anything else here reported a
					// live turn as dead, which stopped the clock and let a second prompt be sent into
					// a turn already in progress.
					const restarted =
						lastStartedAt !== null &&
						currentStartedAt !== null &&
						currentStartedAt !== lastStartedAt;
					lastStartedAt = currentStartedAt;

					if (running() && !ready.running) {
						setRestartNotice(
							restarted
								? "The runner restarted; send again to continue"
								: "That turn has finished; send again to continue",
						);
						setRunning(false);
					} else {
						setRunning(ready.running);
					}
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
					// Nor is the queue: the runner sends what waits on every attach and change.
					if (event.type === "commands" || event.type === "queue") {
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
					// The thread is another agent's now: its picker, its models, its name.
					if (event.type === "handoff") {
						const moved = session();
						if (moved) {
							const next = { ...moved, provider: event.to.provider, model: event.to.model ?? null };
							setSession(next);
							props.onSession(next);
						}
					}
					// The agent opened a page: show the thread's browser beside it, where it can be watched.
					if (event.type === "browser" && !embedded)
						layoutsStore.update(props.id, (layout) =>
							layout.panes.some((pane) => pane.tabs.some((tab) => tab.kind === "browser"))
								? layout
								: openTab(layout, { kind: "browser" }),
						);
					// A crew's report means its members moved: read them again.
					if (event.type === "user" && event.text.startsWith("[Crew report]")) void loadCrew();
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
			.get<{
				events: ChatEvent[];
				cursor: { epoch: string; next: number } | null;
				earlier?: number | null;
			}>(cacheKey)
			.then((kept) => {
				if (disposed) return;
				if (kept?.events?.length) {
					log = kept.events;
					// Kept before threads opened in pages, the log is the whole thread.
					setEarlier(kept.earlier ?? null);
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
		() => transcript().blocks.filter((block) => block.kind === "user").length - olderMessages(),
		() => {
			setPinned(true);
			scrollToEnd();
		},
	);

	/**
	 * Sends a message with new files and, for Regenerate, files the thread already holds. While
	 * the agent works it waits in the queue, or with `steer` goes into the turn going on.
	 */
	async function send(
		text: string,
		files: File[] = [],
		steer = false,
		existing: string[] = [],
	): Promise<boolean> {
		const token = auth.token();
		if (!token || connection() !== "open") {
			setError("Not connected to the runner right now — your message is still in the box.");
			return false;
		}
		const attachments = await chatService.upload(token, props.id, files, props.scope);
		setError(null);
		setRestartNotice(null);
		const ids = [...existing, ...attachments.map((item) => item.id)];
		if (
			!socket?.send({
				t: "prompt",
				text,
				attachments: ids,
				...(steer ? { delivery: "steer" as const } : {}),
			})
		) {
			setError("Not connected to the runner right now — your message is still in the box.");
			return false;
		}
		return true;
	}

	const facts = createMemo(() => threadFacts(transcript().blocks));
	// What the agent is waiting on, docked over the composer where the answer is given.
	const waitingOn = createMemo(() => pendingApprovals(transcript()));
	const asking = createMemo(() => pendingQuestions(transcript()));
	const subagents = createMemo(() => runningSubagents(transcript()));

	/** Bring a subagent's card into view, from its chip above the composer. */
	function openSubagent(id: string): void {
		const card = scroller?.querySelector<HTMLElement>(`[data-subagent="${CSS.escape(id)}"]`);
		if (!card) return;
		setPinned(false);
		card.scrollIntoView({ behavior: "smooth", block: "center" });
		if (card instanceof HTMLDetailsElement) card.open = true;
	}

	// Undo asks first: it puts files back, which may throw away edits made since.
	const [undoTurn, setUndoTurn] = createSignal<number | null>(null);
	const [undoing, setUndoing] = createSignal(false);
	async function undo(turn: number): Promise<void> {
		const token = auth.token();
		if (!token) return;
		setUndoing(true);
		try {
			await chatService.restoreCheckpoint(token, props.id, turn, props.scope);
			setUndoTurn(null);
		} catch (cause) {
			notify({
				title: cause instanceof Error ? cause.message : "Could not undo that turn",
				tone: "danger",
			});
		} finally {
			setUndoing(false);
		}
	}

	// The agents this thread can be handed to: installed and not turned off.
	const agents = () =>
		props.providers.filter((item) => item.available && item.settings?.enabled !== false);
	/** An agent named the way a person types it: its id or its name, any case. */
	const agentNamed = (text: string) => {
		const wanted = text.trim().toLowerCase();
		return agents().find(
			(item) => item.id.toLowerCase() === wanted || item.name.toLowerCase() === wanted,
		);
	};

	/** Hand this thread to another agent: here, or in a new thread that then opens. */
	async function handoff(providerId: string, newThread = false): Promise<void> {
		const token = auth.token();
		const current = session();
		if (!token || !current) return;
		if (running()) {
			notify({
				title: "Wait for this turn to finish, or stop it, before handing off",
				tone: "danger",
			});
			return;
		}
		const name = props.providers.find((item) => item.id === providerId)?.name ?? providerId;
		try {
			const moved = await chatService.handoff(
				token,
				props.id,
				{ provider: providerId, newThread },
				props.scope,
			);
			if (newThread) {
				threadsStore.upsert(moved);
				navigate(`/chat/${encodeURIComponent(moved.project)}/${encodeURIComponent(moved.id)}`);
				return;
			}
			setSession(moved);
			props.onSession(moved);
			notify({ title: `${name} carries on this thread`, tone: "success" });
		} catch (cause) {
			notify({
				title: cause instanceof Error ? cause.message : "Could not hand off",
				tone: "danger",
			});
		}
	}

	useCommand("browser.toggle", () => {
		if (embedded) return false;
		layoutsStore.update(props.id, (layout) => toggleTab(layout, { kind: "browser" }));
	});
	useCommand("chat.side", () => {
		if (embedded) return false;
		void openSide();
	});

	/** Open a side chat beside this thread, in the workspace, optionally with another agent. */
	async function openSide(providerId?: string): Promise<void> {
		const token = auth.token();
		if (!token || !session()) return;
		try {
			const side = await chatService.side(
				token,
				props.id,
				providerId ? { provider: providerId } : {},
				props.scope,
			);
			layoutsStore.update(props.id, (layout) =>
				openTab(layout, { kind: "chat", id: side.id, title: side.title }),
			);
		} catch (cause) {
			notify({
				title: cause instanceof Error ? cause.message : "Could not open a side chat",
				tone: "danger",
			});
		}
	}

	// A crew's coordinator: its members, and their approvals, kept fresh while it is open.
	const [crew, setCrew] = createSignal<Crew | null>(null);
	const [memberApprovals, setMemberApprovals] = createSignal<WaitingApproval[]>([]);
	const [crewSettings, setCrewSettings] = createSignal(false);
	async function loadCrew(): Promise<void> {
		const token = auth.token();
		if (!token || embedded) return;
		try {
			const found = await chatService.crew(token, props.id, props.scope);
			setCrew(found);
			if (!found) return;
			const members = new Set(found.workers.map((item) => item.sessionId).filter(Boolean));
			const waiting = await chatService.waiting(token, props.scope);
			setMemberApprovals(waiting.filter((item) => members.has(item.sessionId)));
		} catch (cause) {
			console.warn("[chat] could not read the crew:", cause);
		}
	}
	onSettled(() => {
		void loadCrew();
		const timer = setInterval(() => {
			if (crew() && document.visibilityState === "visible") void loadCrew();
		}, CREW_POLL_MS);
		return () => clearInterval(timer);
	});
	async function crewAction(run: (token: string, crew: Crew) => Promise<unknown>): Promise<void> {
		const token = auth.token();
		const current = crew();
		if (!token || !current) return;
		try {
			await run(token, current);
		} catch (cause) {
			notify({
				title: cause instanceof Error ? cause.message : "The crew could not do that",
				tone: "danger",
			});
		}
		await loadCrew();
	}

	/** A new thread from this one, up to message `at` (the whole thread when unset), then open it. */
	async function fork(at?: string, worktree = false): Promise<void> {
		const token = auth.token();
		const current = session();
		if (!token || !current) return;
		try {
			const forked = await chatService.fork(
				token,
				props.id,
				{ ...(at ? { at } : {}), worktree },
				props.scope,
			);
			threadsStore.upsert(forked);
			navigate(`/chat/${encodeURIComponent(forked.project)}/${encodeURIComponent(forked.id)}`);
		} catch (cause) {
			notify({
				title: cause instanceof Error ? cause.message : "Could not fork this thread",
				tone: "danger",
			});
		}
	}
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

	/** The agent's edits to one file, in the order it made them, for a file tab in the workspace. */
	const diffsFor = (path: string): FileDiff[] =>
		transcript().blocks.flatMap((block) =>
			block.kind === "tool" ? (block.diffs ?? []).filter((diff) => diff.path === path) : [],
		);
	/** What the thread's workspace needs; null until the thread is known. */
	const workspaceProps = (): WorkspaceProps | null => {
		const current = place();
		if (!current) return null;
		return {
			place: {
				thread: props.id,
				cwd: current.cwd,
				environment: placementsStore.environmentOf(current.project) ?? undefined,
			},
			project: current.project,
			folder: workspace.folders()[current.project],
			files: facts().files,
			diffsFor,
			renderChat: (id) => (
				<Conversation
					id={id}
					scope={props.scope}
					providers={props.providers}
					onSession={() => undefined}
					embedded
				/>
			),
		};
	};
	const split = () => layoutsStore.of(props.id).mode !== "focus";

	const threadColumn = (): JSX.Element => (
		<div class="flex min-h-0 min-w-0 flex-1 flex-col">
			<Show when={!embedded && subtitle()}>
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
						if (el.scrollTop < 400 && hasEarlier()) void loadEarlier();
					}}
					class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 md:px-6"
				>
					<div class="mx-auto flex w-full max-w-160 flex-col gap-6">
						<Show when={embedded ? null : session()}>
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
						<Show when={hasEarlier()}>
							<div class="flex justify-center">
								<Button
									variant="ghost"
									size="sm"
									disabled={loadingEarlier()}
									onClick={() => void loadEarlier()}
								>
									{loadingEarlier() ? "Loading earlier messages…" : "Show earlier messages"}
								</Button>
							</div>
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
							onUndo={(turn) => setUndoTurn(turn)}
							onFork={(at, worktree) => void fork(at, worktree)}
							onChoose={(message) =>
								void send(message, [], running()).catch((cause) =>
									setError(cause instanceof Error ? cause.message : "Could not send message"),
								)
							}
							agentName={(id) => props.providers.find((item) => item.id === id)?.name ?? id}
							forkedHref={(id) => {
								const project = session()?.project;
								return project
									? `/chat/${encodeURIComponent(project)}/${encodeURIComponent(id)}`
									: undefined;
							}}
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
					<Show when={!embedded && !shell.desktop() ? workspaceProps() : null}>
						{(workspaceOf) => <DockedWorkspace {...workspaceOf()} />}
					</Show>
					<Show when={crew()}>
						{(current) => (
							<div class="mb-2">
								<CrewPanel
									name={current().name}
									parallel={current().parallel}
									paused={current().paused}
									members={current().workers.map((member) => ({
										id: member.id,
										key: member.key,
										title: member.title,
										state: member.state,
										running: member.running,
										waiting: member.waiting,
										href: member.sessionId
											? `/chat/${encodeURIComponent(current().project)}/${encodeURIComponent(member.sessionId)}`
											: undefined,
									}))}
									approvals={
										memberApprovals().length ? (
											<For each={memberApprovals()}>
												{(item) => (
													<ApprovalCard
														approval={{
															kind: "approval",
															key: item.approval.id,
															id: item.approval.id,
															title: `${item.thread}: ${item.approval.title}`,
															detail: item.approval.detail ?? undefined,
															options: item.approval.options,
														}}
														onApprove={(approvalId, optionId) =>
															void crewAction((token) =>
																chatService.answerApproval(
																	token,
																	item.sessionId,
																	approvalId,
																	optionId,
																	props.scope,
																),
															)
														}
													/>
												)}
											</For>
										) : undefined
									}
									onRetry={(worker) =>
										void crewAction((token, current) =>
											chatService.crewWorker(token, current.id, worker, "retry", props.scope),
										)
									}
									onStop={(worker) =>
										void crewAction((token, current) =>
											chatService.crewWorker(token, current.id, worker, "stop", props.scope),
										)
									}
									onPause={(paused) =>
										void crewAction((token, current) =>
											chatService.updateCrew(token, current.id, { paused }, props.scope),
										)
									}
									onSettings={() => setCrewSettings(true)}
								/>
							</div>
						)}
					</Show>
					<Show when={subagents().length > 0}>
						<div class="mb-2">
							<SubagentStrip
								agents={subagents().map((agent) => ({
									id: agent.id,
									title: agent.title,
									activity: agent.activity,
								}))}
								onOpen={openSubagent}
							/>
						</div>
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
					<For each={asking()}>
						{(question) => (
							<div class="mb-2">
								<QuestionCard
									questions={question.questions}
									onAnswer={(answers) => socket?.send({ t: "answer", id: question.id, answers })}
								/>
							</div>
						)}
					</For>
					<Show when={transcript().queue.items.length > 0}>
						<div class="mb-2">
							<QueueList
								items={transcript().queue.items.map((item) => ({
									id: item.id,
									text: item.text,
									files: item.attachments?.length ?? 0,
								}))}
								paused={transcript().queue.paused}
								running={running()}
								onRemove={(id) => socket?.send({ t: "queue", action: "remove", id })}
								onSendNow={(id) => socket?.send({ t: "queue", action: "steer", id })}
								onResume={() => socket?.send({ t: "queue", action: "resume" })}
								onClear={() => socket?.send({ t: "queue", action: "clear" })}
							/>
						</div>
					</Show>
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
								<Show when={!embedded && !shell.desktop()}>
									<WorkspaceToggle thread={props.id} />
								</Show>
								<Show when={models().length > 0}>
									<ModelPicker
										agent={session()?.provider}
										agentName={provider()?.name}
										agents={agents()}
										onAgent={(id) => void handoff(id)}
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
	);

	// A side chat inside another thread's workspace: the conversation, and Undo's question.
	if (embedded)
		return (
			<div class="flex min-h-0 flex-1">
				<ConfirmDialog
					open={undoTurn() !== null}
					onClose={() => setUndoTurn(null)}
					onConfirm={() => {
						const turn = undoTurn();
						if (turn !== null) void undo(turn);
					}}
					title="Undo this turn?"
					description="The files this turn changed, and any changed after it, go back to how this turn found them."
					confirm="Undo changes"
					danger
					pending={undoing()}
					stayOpen
				/>
				{threadColumn()}
			</div>
		);

	return (
		<div class="flex min-h-0 flex-1">
			<ConfirmDialog
				open={undoTurn() !== null}
				onClose={() => setUndoTurn(null)}
				onConfirm={() => {
					const turn = undoTurn();
					if (turn !== null) void undo(turn);
				}}
				title="Undo this turn?"
				description="The files this turn changed, and any changed after it, go back to how this turn found them. Your git history and branch stay as they are; what is there now is kept under a hidden git ref."
				confirm="Undo changes"
				danger
				pending={undoing()}
				stayOpen
			/>
			<Show when={crew()}>
				{(current) => (
					<CrewSettingsDialog
						open={crewSettings()}
						crew={current()}
						onClose={() => setCrewSettings(false)}
						onSave={(patch) =>
							crewAction((token, saved) =>
								chatService.updateCrew(token, saved.id, patch, props.scope),
							).then(() => {
								setCrewSettings(false);
							})
						}
					/>
				)}
			</Show>
			<Show when={shell.desktop() && workspaceProps()}>
				<ShellSlot name="actions">
					<IconButton
						size="sm"
						label="Open a side chat"
						tooltip="Side chat: ask a narrow question beside this thread"
						onClick={() => void openSide()}
					>
						<ChatIcon size="sm" />
					</IconButton>
					<SplitSwitch thread={props.id} />
				</ShellSlot>
			</Show>
			<Show when={workspaceProps()} fallback={threadColumn()}>
				{(workspaceOf) => (
					<SplitFrame {...workspaceOf()} wide={shell.desktop()}>
						{threadColumn()}
					</SplitFrame>
				)}
			</Show>
			{/* Split takes the place of the run details: the workspace is the thread's side now. */}
			<Show when={shell.desktop() && split() ? null : session()}>
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
