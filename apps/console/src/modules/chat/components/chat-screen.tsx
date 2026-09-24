import { useMatch, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, createSignal, onSettled, Show, untrack } from "solid-js";

import { useAuth } from "@/modules/auth";
import { useWorkspace } from "@/modules/projects";
import { useShell, ShellSlot } from "@/modules/shell";
import { ErrorNotice, FolderIcon } from "@/ui";

import { chatService } from "../services/chat.service";
import type { ChatProvider, ChatSession } from "../types/chat.types";

import { Composer } from "./composer";
import { Conversation, queueFirstMessage } from "./conversation";
import { ModelPicker, ModePicker } from "./pickers";
import { ProjectChats, SessionList, SessionTabs } from "./session-list";

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

const tabsKey = (project: string) => `grid.chat.tabs.${project}`;

function rememberedTabs(project: string): string[] {
	try {
		const saved: unknown = JSON.parse(localStorage.getItem(tabsKey(project)) ?? "[]");
		return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string") : [];
	} catch {
		return [];
	}
}

function rememberTabs(project: string, ids: string[]): void {
	try {
		localStorage.setItem(tabsKey(project), JSON.stringify(ids));
	} catch {
		// Not remembered; the tabs start empty next time.
	}
}

/**
 * Chat with agents, per project. The project's chats are the workspace panel (a column on
 * desktop, the drawer on phones), open chats are tabs in the title bar, and the screen is the
 * conversation or, with none open, the new-chat composer.
 */
export function ChatScreen(): JSX.Element {
	const auth = useAuth();
	const shell = useShell();
	const workspace = useWorkspace();
	const navigate = useNavigate();
	const inChat = useMatch(() => "/chat/:project/:id");
	const inProject = useMatch(() => "/chat/:project");
	const routeId = createMemo(() => inChat()?.params.id ?? null);
	// `new` is the new-chat composer; any other id is a conversation.
	const activeId = createMemo(() => (routeId() === "new" ? null : routeId()));

	// Chats live inside their project; the URL names it, and `/chat` alone opens the current one.
	const project = createMemo(() => {
		const wanted = inChat()?.params.project ?? inProject()?.params.project ?? null;
		const list = workspace.projects();
		return list.find((item) => item.slug === wanted)?.slug ?? workspace.currentSlug();
	});
	createEffect(
		() => [project(), inChat() ?? inProject()] as const,
		([slug, matched]) => {
			if (slug && !matched) navigate(workspace.projectHref(slug), { replace: true });
		},
	);
	const projectName = () =>
		workspace.projects().find((item) => item.slug === project())?.name ?? project() ?? "";
	const folder = () => (project() ? workspace.folders()[project() ?? ""] : undefined);

	const [providers, setProviders] = createSignal<ChatProvider[]>([]);
	const [sessions, setSessions] = createSignal<ChatSession[]>([]);
	const [loaded, setLoaded] = createSignal(false);
	// Which project the loaded list belongs to, so a switch never judges the new URL by old chats.
	const [loadedFor, setLoadedFor] = createSignal<string | null>(null);
	const [error, setError] = createSignal<string | null>(null);
	const [tabIds, setTabIds] = createSignal<string[]>([]);

	async function loadSessions(slug: string, token: string): Promise<void> {
		try {
			setSessions(await chatService.sessions(token, slug));
			setLoadedFor(slug);
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

	// Each project remembers its open tabs; opening a chat adds it to them.
	createEffect(
		() => project(),
		(slug) => {
			if (slug) setTabIds(rememberedTabs(slug));
		},
	);
	// A chat that no longer exists (removed on the runner) falls back to a new one.
	createEffect(
		() => [loadedFor(), project(), activeId(), sessions()] as const,
		([listed, slug, id, list]) => {
			if (!slug || listed !== slug || !id || list.some((session) => session.id === id)) return;
			workspace.rememberChat(slug, null);
			navigate(`/chat/${slug}`, { replace: true });
		},
	);
	// The project reopens on the chat you were in.
	createEffect(
		() => [project(), routeId()] as const,
		([slug, route]) => {
			if (slug && route) workspace.rememberChat(slug, route === "new" ? null : route);
		},
	);
	createEffect(
		() => activeId(),
		(id) => {
			const slug = untrack(project);
			if (!id || !slug || untrack(tabIds).includes(id)) return;
			const next = [...untrack(tabIds), id];
			setTabIds(next);
			rememberTabs(slug, next);
		},
	);
	// Tabs for chats that still exist, in the order they were opened.
	const tabs = createMemo(() =>
		tabIds()
			.map((id) => sessions().find((session) => session.id === id))
			.filter((session): session is ChatSession => Boolean(session)),
	);

	const chatUrl = (id?: string) => (id ? `/chat/${project()}/${id}` : `/chat/${project()}`);

	function closeTab(id: string): void {
		const slug = project();
		if (!slug) return;
		const open = tabs().map((tab) => tab.id);
		const next = tabIds().filter((item) => item !== id);
		setTabIds(next);
		rememberTabs(slug, next);
		if (activeId() !== id) return;
		// Closing the current tab shows its neighbour, as a browser does, or the composer.
		const index = open.indexOf(id);
		const neighbour = open[index + 1] ?? open[index - 1];
		navigate(neighbour ? chatUrl(neighbour) : chatUrl());
	}

	function updateSession(session: ChatSession): void {
		setSessions((list) => {
			const rest = list.filter((item) => item.id !== session.id);
			return [session, ...rest].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
		});
	}

	return (
		<>
			<ShellSlot name="panel">
				<SessionList
					projectName={projectName()}
					sessions={sessions()}
					providers={providers()}
					loaded={loaded()}
					error={error()}
					activeId={activeId()}
					hrefFor={chatUrl}
					onNew={() => navigate(chatUrl())}
				/>
			</ShellSlot>
			<ShellSlot name="projectChats">
				<ProjectChats
					sessions={sessions()}
					activeId={activeId()}
					hrefFor={chatUrl}
					newHref={chatUrl()}
				/>
			</ShellSlot>
			<ShellSlot name="tabs">
				<SessionTabs
					tabs={tabs()}
					activeId={activeId()}
					compact={!shell.desktop()}
					hrefFor={chatUrl}
					onClose={closeTab}
				/>
			</ShellSlot>
			<Show
				when={activeId()}
				keyed
				fallback={
					<NewChat
						project={project()}
						projectName={projectName()}
						providers={providers()}
						folder={folder()}
						onChooseFolder={() => workspace.chooseFolderFor(project())}
						onCreated={(session) => {
							updateSession(session);
							navigate(chatUrl(session.id));
						}}
					/>
				}
			>
				{(id) => <Conversation id={id} providers={providers()} onSession={updateSession} />}
			</Show>
		</>
	);
}

/** "What should we work on?" — pick an agent, type, and the chat starts with that message. */
function NewChat(props: {
	project: string | null;
	projectName: string;
	providers: ChatProvider[];
	/** The project's folder on this machine: where the agent works. */
	folder: string | undefined;
	onChooseFolder: () => void;
	onCreated: (session: ChatSession) => void;
}): JSX.Element {
	const auth = useAuth();
	const available = () => props.providers.filter((provider) => provider.available);
	const [agent, setAgent] = createSignal<string | null>(null);
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
		<div class="flex min-h-0 flex-1 flex-col justify-end overflow-y-auto px-3 pb-3 md:justify-center md:px-6 md:py-12">
			<div class="mx-auto flex w-full max-w-3xl flex-col">
				<h1 class="mb-4 truncate px-2.5 text-ink text-ui-lg">
					What should we work on{props.projectName ? ` in ${props.projectName}` : ""}?
				</h1>
				<Show when={error()}>
					{(message) => (
						<div class="mb-3">
							<ErrorNotice message={message()} />
						</div>
					)}
				</Show>
				<Show
					when={available().length > 0 || props.providers.length === 0}
					fallback={
						<ErrorNotice message="No supported agent is installed on this machine (Claude Code, opencode, or an ACP agent)." />
					}
				>
					<Composer
						running={false}
						disabled={!chosen() || !props.project}
						onSend={start}
						header={<FolderLine folder={props.folder} onChoose={props.onChooseFolder} />}
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

/** Where the agent will work: the project's folder, or a prompt to choose one. */
function FolderLine(props: { folder: string | undefined; onChoose: () => void }): JSX.Element {
	return (
		<Show
			when={props.folder}
			fallback={
				<button
					type="button"
					onClick={() => props.onChoose()}
					class="focus-ring mt-0.5 flex items-center gap-1 rounded-sm text-link text-ui-xs underline-offset-2 hover:underline"
				>
					<FolderIcon class="size-3.5 shrink-0" />
					Choose this project's folder
				</button>
			}
		>
			{(path) => (
				<button
					type="button"
					title={`${path()} — change`}
					onClick={() => props.onChoose()}
					class="focus-ring mt-0.5 flex min-w-0 max-w-full items-center gap-1 rounded-sm text-ink/45 text-ui-xs hover:text-ink/70"
				>
					<FolderIcon class="size-3.5 shrink-0" />
					<span class="truncate">{path().replace(/^\/home\/[^/]+/, "~")}</span>
				</button>
			)}
		</Show>
	);
}
