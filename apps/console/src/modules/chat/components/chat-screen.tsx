import { useMatch, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, createSignal, onSettled, Show, untrack } from "solid-js";

import { onRunnerRecovered } from "@/lib/runner-health";

import { useAuth } from "@/modules/auth";
import { placementsStore, scopeFor } from "@/modules/environments";
import { useWorkspace } from "@/modules/projects";
import { ShellSlot, useShell } from "@/modules/shell";
import { Button, ErrorNotice, FolderIcon } from "@/ui";

import { chatService } from "../services/chat.service";
import { draftsStore } from "../stores/drafts";
import { offeredProviders, providersStore } from "../stores/providers";
import { threadsStore } from "../stores/threads";
import type { ChatProvider, ChatSession } from "../types/chat.types";

import { Composer } from "./composer";
import { Conversation, queueFirstMessage } from "./conversation";
import { ModelPicker, ModePicker } from "./pickers";
import { SessionTabs } from "./session-list";

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

	// The machine this project runs on (its folder's): its agents, threads and sockets are there.
	const scope = () => scopeFor(placementsStore.environmentOf(project()));
	const providers = () => providersStore.providers(scope());
	const sessions = () => threadsStore.threads(project() ?? "");
	const [tabIds, setTabIds] = createSignal<string[]>([]);

	// The agents are read once per visit and kept; the threads are shared with the sidebar. Where
	// the project runs is known first, so both come from the right machine.
	createEffect(
		() => [project(), auth.token(), scope()] as const,
		([slug, token]) => {
			if (!token) return;
			void placementsStore.load(token).then(() => {
				const where = untrack(scope);
				void providersStore.load(token, where);
				if (slug) void threadsStore.reload(token, slug);
			});
		},
	);

	onSettled(() => {
		const unsub = onRunnerRecovered(() => {
			const token = auth.token();
			if (!token) return;
			void providersStore.reload(token, untrack(scope));
			const slug = untrack(project);
			if (slug) void threadsStore.reload(token, slug);
		});
		return unsub;
	});

	// Each project remembers its open tabs; opening a chat adds it to them.
	createEffect(
		() => project(),
		(slug) => {
			if (slug) setTabIds(rememberedTabs(slug));
		},
	);
	// A chat that no longer exists (removed on the runner) falls back to a new one.
	createEffect(
		() => [project(), activeId(), sessions(), threadsStore.loaded(project() ?? "")] as const,
		([slug, id, list, loaded]) => {
			if (!slug || !id || !loaded || list.some((session) => session.id === id)) return;
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

	return (
		<>
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
							threadsStore.upsert(session);
							navigate(chatUrl(session.id));
						}}
					/>
				}
			>
				{(id) => (
					<Conversation
						id={id}
						scope={scope()}
						providers={providers()}
						onSession={threadsStore.upsert}
					/>
				)}
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
	// A draft left for this project (a thread started from a task), taken once.
	const initial = untrack(() => (props.project ? draftsStore.take(props.project) : undefined));
	// Installed agents that are not turned off in Settings → Agents.
	const available = () => offeredProviders(props.providers);
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
		// Your pick, else the last one used, else the default set in Settings, else the first.
		const wanted =
			pickedModel() ?? remembered(modelKey(provider.id)) ?? provider.settings?.model ?? null;
		return models().find((item) => item.id === wanted)?.id ?? models()[0]?.id ?? null;
	};
	const currentModel = () => models().find((item) => item.id === model());
	const efforts = () => currentModel()?.efforts ?? [];
	const effort = () => {
		const provider = chosen();
		const wanted =
			pickedEffort() ??
			(provider ? (remembered(effortKey(provider.id)) ?? provider.settings?.effort ?? null) : null);
		return (
			efforts().find((level) => level.id === wanted)?.id ?? currentModel()?.defaultEffort ?? null
		);
	};

	async function start(text: string): Promise<boolean> {
		const token = auth.token();
		const provider = chosen();
		if (!token || !provider || !props.project || !props.folder) return false;
		setError(null);
		try {
			const session = await chatService.create(
				token,
				{
					project: props.project,
					provider: provider.id,
					// The project's folder, sent explicitly: the chat works there and resumes there.
					cwd: props.folder,
					model: model() ?? undefined,
					effort: effort() ?? undefined,
					mode: mode() ?? provider.settings?.mode ?? undefined,
				},
				placementsStore.scopeOf(props.project),
			);
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
				<Show when={!props.folder && props.project}>
					<div class="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-ink/10 bg-ink/4 px-3 py-2.5">
						<FolderIcon class="size-4 shrink-0 text-ink/50" />
						<p class="min-w-0 flex-1 text-ink/70 text-ui-sm">
							A project is a folder: choose this project's folder so its threads work inside it.
						</p>
						<Button variant="primary" onClick={() => props.onChooseFolder()}>
							Choose folder
						</Button>
					</div>
				</Show>
				<Show
					when={available().length > 0 || props.providers.length === 0}
					fallback={
						<ErrorNotice message="No agent is available on this project's machine. Install and sign in one in Settings → Agents, or turn one on there." />
					}
				>
					<Composer
						project={props.project}
						initial={initial}
						running={false}
						disabled={!chosen() || !props.project || !props.folder}
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
												mode={
													mode() ??
													provider().settings?.mode ??
													provider().defaultMode ??
													provider().modes[0].id
												}
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
