import { useMatch, useNavigate, useSearchParams } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	Loading,
	onSettled,
	Show,
	untrack,
} from "solid-js";

import { useAuth } from "@/modules/auth";
import { useWorkspace } from "@/modules/projects";
import {
	BackIcon,
	ChatIcon,
	ErrorNotice,
	FolderIcon,
	IconButton,
	PlusIcon,
	Select,
	Skeleton,
} from "@/ui";

import { chatService } from "../services/chat.service";
import type { ChatProvider, ChatSession } from "../types/chat.types";

import { Composer } from "./composer";
import { Conversation, queueFirstMessage } from "./conversation";
import { ModelPicker, ModePicker } from "./pickers";

const AGENT_KEY = "grid.chat.agent";

function remembered(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function remember(key: string, value: string | null): void {
	try {
		if (value) localStorage.setItem(key, value);
	} catch {
		// Not remembered; the defaults are fine next time.
	}
}

// The last model and effort chosen for each agent, so a new chat starts where the last one did.
const modelKey = (agent: string) => `grid.chat.model.${agent}`;
const effortKey = (agent: string) => `grid.chat.effort.${agent}`;

function relative(iso: string): string {
	const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
	if (minutes < 1) return "now";
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h`;
	return `${Math.round(hours / 24)}d`;
}

/**
 * Chat with agents, per project. Phones show the list or one conversation; from lg the list
 * stays beside the conversation. The screen is sized to the visible viewport so the composer
 * sits right above the phone keyboard.
 */
export function ChatScreen(): JSX.Element {
	const auth = useAuth();
	const workspace = useWorkspace();
	const navigate = useNavigate();
	const [params] = useSearchParams();
	const match = useMatch(() => "/chat/:id");
	const routeId = createMemo(() => match()?.params.id ?? null);
	// `/chat/new` is the new-chat composer; any other id is a conversation.
	const activeId = createMemo(() => (routeId() === "new" ? null : routeId()));

	const project = createMemo(() => {
		const wanted = typeof params.project === "string" ? params.project : null;
		const list = workspace.projects();
		return list.find((item) => item.slug === wanted)?.slug ?? list[0]?.slug ?? null;
	});

	const [providers, setProviders] = createSignal<ChatProvider[]>([]);
	const [sessions, setSessions] = createSignal<ChatSession[]>([]);
	const [loaded, setLoaded] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);
	let root: HTMLDivElement | undefined;

	async function loadSessions(slug: string, token: string): Promise<void> {
		try {
			setSessions(await chatService.sessions(token, slug));
			setError(null);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not load chats");
		} finally {
			setLoaded(true);
		}
	}

	onSettled(() => {
		const token = untrack(auth.token);
		if (!token) return;
		chatService
			.providers(token)
			.then(setProviders, (cause: unknown) =>
				setError(cause instanceof Error ? cause.message : "Could not reach the runner"),
			);
	});

	// Read in the effect's tracked half, so a project switch (or a renewed token) reloads the list.
	createEffect(
		() => [project(), auth.token()] as const,
		([slug, token]) => {
			if (slug && token) void loadSessions(slug, token);
		},
	);

	// Fit the visible viewport, as the terminal does, so the composer stays above the keyboard.
	onSettled(() => {
		const fit = () => {
			if (!root) return;
			const viewport = window.visualViewport;
			const bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
			root.style.height = `${Math.max(240, bottom - root.getBoundingClientRect().top)}px`;
		};
		fit();
		const html = document.documentElement;
		const previous = html.style.overflow;
		html.style.overflow = "hidden";
		window.visualViewport?.addEventListener("resize", fit);
		window.visualViewport?.addEventListener("scroll", fit);
		window.addEventListener("resize", fit);
		return () => {
			html.style.overflow = previous;
			window.visualViewport?.removeEventListener("resize", fit);
			window.visualViewport?.removeEventListener("scroll", fit);
			window.removeEventListener("resize", fit);
		};
	});

	// Phones show one pane: the list, or the conversation / new chat. With no chats yet the list
	// has nothing to offer, so the new-chat composer shows straight away.
	const showList = () => !routeId() && (!loaded() || sessions().length > 0);

	const chatUrl = (id?: string) => {
		const query = project() ? `?project=${encodeURIComponent(project() ?? "")}` : "";
		return id ? `/chat/${id}${query}` : `/chat${query}`;
	};

	function updateSession(session: ChatSession): void {
		setSessions((list) => {
			const rest = list.filter((item) => item.id !== session.id);
			return [session, ...rest].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
		});
	}

	return (
		<div
			ref={(el) => {
				root = el;
			}}
			class="-mx-4 -mt-3 flex min-h-0 overflow-hidden md:-mx-6 lg:-mx-4 lg:-mt-3 lg:grid lg:grid-cols-[18rem_minmax(0,1fr)]"
		>
			{/* The list: the whole screen on phones when no chat is open; a column from lg. */}
			<aside
				class={`min-h-0 w-full flex-col border-stroke lg:flex lg:border-r ${showList() ? "flex" : "hidden"}`}
			>
				<div class="flex shrink-0 items-center gap-2 px-3 pt-3 pb-2">
					<Loading fallback={<Skeleton class="h-8 flex-1" />}>
						<Select
							aria-label="Project"
							class="min-w-0 flex-1"
							value={project() ?? ""}
							options={workspace.projects().map((item) => ({ value: item.slug, label: item.name }))}
							onChange={(slug) => navigate(`/chat?project=${encodeURIComponent(slug)}`)}
						/>
					</Loading>
					<IconButton label="New chat" onClick={() => navigate(chatUrl("new"))}>
						<PlusIcon class="size-4" />
					</IconButton>
				</div>
				<Show when={error()}>
					{(message) => (
						<div class="px-3 pb-2">
							<ErrorNotice message={message()} />
						</div>
					)}
				</Show>
				<nav aria-label="Chats" class="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
					<Show
						when={loaded()}
						fallback={
							<div class="flex flex-col gap-2 p-1">
								<Skeleton class="h-12" />
								<Skeleton class="h-12" />
							</div>
						}
					>
						<Show
							when={sessions().length > 0}
							fallback={
								<p class="px-2 py-6 text-center text-ink/45 text-ui-sm">
									No chats in this project yet.
								</p>
							}
						>
							<For each={sessions()}>
								{(session) => (
									<a
										href={chatUrl(session.id)}
										aria-current={activeId() === session.id ? "page" : undefined}
										class="focus-ring flex flex-col gap-0.5 rounded-lg px-2.5 py-2 transition-colors duration-fast ease-out-grid hover:bg-ink/6 aria-[current=page]:bg-selection"
									>
										<span class="flex items-center gap-1.5 text-ink/45 text-ui-xs">
											<span class="truncate">
												{providers().find((provider) => provider.id === session.provider)?.name ??
													session.provider}
												{session.model && session.model !== "default" ? ` · ${session.model}` : ""}
											</span>
											<span class="ml-auto shrink-0 tabular-nums">
												{relative(session.updatedAt)}
											</span>
										</span>
										<span class="truncate font-medium text-ink text-ui-sm">{session.title}</span>
									</a>
								)}
							</For>
						</Show>
					</Show>
				</nav>
			</aside>

			{/* The conversation, or the new-chat composer. */}
			<section
				class={`min-h-0 min-w-0 flex-1 flex-col lg:flex ${showList() ? "hidden lg:flex" : "flex"}`}
			>
				<Show
					when={activeId()}
					keyed
					fallback={
						<>
							<Show when={sessions().length > 0}>
								<header class="flex h-11 shrink-0 items-center gap-1 border-stroke border-b px-2 lg:hidden">
									<IconButton label="All chats" onClick={() => navigate(chatUrl())}>
										<BackIcon class="size-4" />
									</IconButton>
									<h1 class="min-w-0 flex-1 truncate font-medium text-ui">New chat</h1>
								</header>
							</Show>
							<NewChat
								project={project()}
								projectName={
									workspace.projects().find((item) => item.slug === project())?.name ??
									project() ??
									""
								}
								providers={providers()}
								onCreated={(session) => {
									updateSession(session);
									navigate(chatUrl(session.id));
								}}
							/>
						</>
					}
				>
					{(id) => (
						<>
							<header class="flex h-11 shrink-0 items-center gap-1 border-stroke border-b px-2 lg:px-4">
								<IconButton label="All chats" class="lg:hidden" onClick={() => navigate(chatUrl())}>
									<BackIcon class="size-4" />
								</IconButton>
								<h1 class="min-w-0 flex-1 truncate font-medium text-ui">
									{sessions().find((session) => session.id === id)?.title ?? "Chat"}
								</h1>
							</header>
							<Conversation id={id} providers={providers()} onSession={updateSession} />
						</>
					)}
				</Show>
			</section>
		</div>
	);
}

/** "What should we work on?" — pick an agent, type, and the chat starts with that message. */
function NewChat(props: {
	project: string | null;
	projectName: string;
	providers: ChatProvider[];
	onCreated: (session: ChatSession) => void;
}): JSX.Element {
	const auth = useAuth();
	const available = () => props.providers.filter((provider) => provider.available);
	const [agent, setAgent] = createSignal<string | null>(null);
	const [cwd, setCwd] = createSignal("");
	const [error, setError] = createSignal<string | null>(null);

	const chosen = () => {
		const wanted = agent() ?? remembered(AGENT_KEY);
		return available().find((provider) => provider.id === wanted) ?? available()[0] ?? null;
	};
	const [pickedModel, setPickedModel] = createSignal<string | null>(null);
	const [pickedEffort, setPickedEffort] = createSignal<string | null>(null);
	const [mode, setMode] = createSignal<string | null>(null);

	const models = () => chosen()?.models ?? [];
	const model = () => {
		const provider = chosen();
		if (!provider) return null;
		const wanted = pickedModel() ?? remembered(modelKey(provider.id));
		return models().find((item) => item.id === wanted)?.id ?? models()[0]?.id ?? null;
	};
	const currentModel = () => models().find((item) => item.id === model());
	const efforts = () => currentModel()?.efforts ?? [];
	const effort = () => {
		const provider = chosen();
		const wanted = pickedEffort() ?? (provider ? remembered(effortKey(provider.id)) : null);
		return (
			efforts().find((level) => level.id === wanted)?.id ?? currentModel()?.defaultEffort ?? null
		);
	};

	async function start(text: string): Promise<boolean> {
		const token = auth.token();
		const provider = chosen();
		if (!token || !provider || !props.project) return false;
		setError(null);
		try {
			const session = await chatService.create(token, {
				project: props.project,
				provider: provider.id,
				cwd: cwd().trim() || undefined,
				model: model() ?? undefined,
				effort: effort() ?? undefined,
				mode: mode() ?? undefined,
			});
			remember(AGENT_KEY, provider.id);
			remember(modelKey(provider.id), model());
			remember(effortKey(provider.id), effort());
			queueFirstMessage(session.id, text);
			props.onCreated(session);
			return true;
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not start the chat");
			return false;
		}
	}

	return (
		<div class="flex min-h-0 flex-1 flex-col justify-end px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:justify-center md:px-6">
			<div class="mx-auto flex w-full max-w-3xl flex-col gap-3">
				<div class="flex flex-col items-start gap-1 px-1 md:items-center md:text-center">
					<ChatIcon class="size-6 text-ink/30" />
					<h1 class="font-semibold text-title">
						What should we work on{props.projectName ? ` in ${props.projectName}` : ""}?
					</h1>
				</div>
				<Show when={error()}>{(message) => <ErrorNotice message={message()} />}</Show>
				<Show
					when={available().length > 0 || props.providers.length === 0}
					fallback={
						<ErrorNotice message="No supported agent is installed on this machine (Claude Code, opencode, or an ACP agent)." />
					}
				>
					<Composer
						placeholder="Ask, build, fix…"
						running={false}
						disabled={!chosen() || !props.project}
						onSend={start}
						header={
							<label class="flex min-w-0 flex-1 items-center gap-1.5">
								<FolderIcon class="size-3.5 shrink-0" />
								<input
									value={cwd()}
									onInput={(event) => setCwd(event.currentTarget.value)}
									placeholder={props.project ? `~/Projects/${props.project}` : "Folder"}
									aria-label="Folder the agent works in"
									class="min-w-0 flex-1 bg-transparent text-ink/70 text-ui-xs outline-none placeholder:text-ink/40"
								/>
							</label>
						}
						controls={
							<Show when={chosen()}>
								{(provider) => (
									<>
										<ModelPicker
											agents={available()}
											agent={provider().id}
											onAgent={(id) => {
												setAgent(id);
												setPickedModel(null);
												setPickedEffort(null);
												setMode(null);
											}}
											models={models()}
											model={model() ?? ""}
											onModel={(id) => {
												// Keep the chosen effort when the new model has that level too.
												const levels = models().find((item) => item.id === id)?.efforts ?? [];
												if (!levels.some((level) => level.id === effort())) setPickedEffort(null);
												else setPickedEffort(effort());
												setPickedModel(id);
											}}
											efforts={efforts()}
											effort={effort()}
											onEffort={setPickedEffort}
										/>
										<Show when={provider().modes.length > 0}>
											<ModePicker
												modes={provider().modes}
												mode={mode() ?? provider().defaultMode ?? provider().modes[0].id}
												onMode={setMode}
											/>
										</Show>
									</>
								)}
							</Show>
						}
					/>
				</Show>
			</div>
		</div>
	);
}
