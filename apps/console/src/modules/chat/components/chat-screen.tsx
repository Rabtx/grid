import { useMatch, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, createSignal, onSettled, Show, untrack } from "solid-js";

import { onRunnerRecovered } from "@/lib/runner-health";

import { useAuth } from "@/modules/auth";
import { placementsStore, scopeFor } from "@/modules/environments";
import { notesStore, ProjectIcon, useWorkspace } from "@/modules/projects";
import { ShellSlot, useShell } from "@/modules/shell";
import {
	Alert,
	BranchIcon,
	Button,
	CheckIcon,
	IdeaIcon,
	notify,
	type PopoverControl,
	ProjectTile,
	RoleChipGroup,
	Stack,
	Suggestions,
	Text,
	ToolIcon,
} from "@/kit";

import { addBoardTask, runSlashCommand } from "../lib/run-slash-command";
import { availableCommands, type SlashCommand } from "../lib/slash-commands";
import { chatService } from "../services/chat.service";
import { draftsStore } from "../stores/drafts";
import { offeredProviders, providersStore } from "../stores/providers";
import { rolesStore } from "../stores/roles";
import { threadsStore } from "../stores/threads";
import type { ChatProvider, ChatSession, Role, RoleDraft } from "../types/chat.types";

import { GitControl, type WorkPlace } from "./git-control";
import { Composer, type ComposerControl } from "./composer";
import { Conversation, queueFirstMessage } from "./conversation";
import { ModelPicker, ModePicker } from "./pickers";
import { RoleDialog, RoleMenu, RoleSettings } from "./roles";
import { SessionTabs } from "./session-list";

const AGENT_KEY = "grid.chat.agent";
// The role the last thread started as, so the next one does too.
const ROLE_KEY = "grid.chat.role";

function rememberRole(id: string | null): void {
	try {
		if (id) localStorage.setItem(ROLE_KEY, id);
		else localStorage.removeItem(ROLE_KEY);
	} catch {
		// Not remembered; the next thread starts without a role.
	}
}

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

/** Ways into a first message; picking one fills the composer to edit before sending. */
const SUGGESTIONS = [
	{ label: "Explain how this project is organised", icon: () => <IdeaIcon /> },
	{ label: "Find and fix a bug in ", icon: () => <ToolIcon /> },
	{ label: "Write tests for the recent changes", icon: () => <CheckIcon /> },
	{ label: "Review the uncommitted changes", icon: () => <BranchIcon /> },
];

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
	const workspace = useWorkspace();
	const navigate = useNavigate();
	const project = () => workspace.projects().find((item) => item.slug === props.project) ?? null;
	let composer: ComposerControl | undefined;
	let modelPicker: PopoverControl | undefined;
	let modePicker: PopoverControl | undefined;
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

	// The team: roles preset the agent, model and effort; a thread can change them for itself.
	// Read again each time this screen opens, so a teammate's change is seen.
	const roleScope = () => placementsStore.scopeOf(props.project ?? "");
	createEffect(
		() => [auth.token(), roleScope()] as const,
		([token, where]) => {
			if (token) void rolesStore.reload(token, where);
		},
	);
	const roles = () => rolesStore.roles(roleScope());
	/** A role can be used here only when its agent is offered on this project's machine. */
	const offered = (item: Role) => available().some((provider) => provider.id === item.provider);
	const [roleId, setRoleId] = createSignal<string | null>(remembered(ROLE_KEY));
	const role = () => {
		const found = roles().find((item) => item.id === roleId());
		return found && offered(found) ? found : null;
	};
	const [editing, setEditing] = createSignal<{ role: Role | null } | null>(null);
	let roleSettings: PopoverControl | undefined;

	/** What a role runs here: its own picks, else the agent's defaults, as the thread resolves them. */
	function roleChoices(item: Role): {
		model: string | null;
		effort: string | null;
		mode: string | null;
	} {
		const provider = available().find((entry) => entry.id === item.provider);
		const list = provider?.models ?? [];
		const chosenModel =
			list.find((entry) => entry.id === item.model) ??
			list.find((entry) => entry.id === provider?.settings?.model) ??
			list[0];
		return {
			model: chosenModel?.id ?? null,
			effort:
				chosenModel?.efforts?.find((level) => level.id === item.effort)?.id ??
				chosenModel?.defaultEffort ??
				null,
			mode:
				item.mode ??
				provider?.settings?.mode ??
				provider?.defaultMode ??
				provider?.modes[0]?.id ??
				null,
		};
	}

	/** Sets the thread to the role's choices; false when its agent is not offered here. */
	function applyRole(next: Role): boolean {
		if (!offered(next)) return false;
		const choices = roleChoices(next);
		setAgent(next.provider);
		setPickedModel(choices.model);
		setPickedEffort(choices.effort);
		setMode(choices.mode);
		return true;
	}
	function pickRole(id: string | null): void {
		setRoleId(id);
		rememberRole(id);
		const next = roles().find((item) => item.id === id);
		if (next && applyRole(next)) applied = next.id;
	}
	// The remembered role takes effect once the team and its agent are known.
	let applied: string | null = null;
	createEffect(
		() => role(),
		(current) => {
			if (!current || applied === current.id) return;
			if (applyRole(current)) applied = current.id;
		},
	);
	const currentMode = () => {
		const provider = chosen();
		return (
			mode() ?? provider?.settings?.mode ?? provider?.defaultMode ?? provider?.modes[0]?.id ?? null
		);
	};
	/** What this thread runs that the role does not, as a change to save to the role. */
	const roleChanges = (): Partial<RoleDraft> => {
		const current = role();
		const provider = chosen();
		if (!current || !provider) return {};
		if (provider.id !== current.provider)
			return { provider: provider.id, model: model(), effort: effort(), mode: currentMode() };
		const choices = roleChoices(current);
		const patch: Partial<RoleDraft> = {};
		if (model() !== choices.model) patch.model = model();
		if (effort() !== choices.effort) patch.effort = effort();
		if (currentMode() !== choices.mode) patch.mode = currentMode();
		return patch;
	};
	const roleChanged = () => Object.keys(roleChanges()).length > 0;

	function chooseAgent(id: string): void {
		setAgent(id);
		setPickedModel(null);
		setPickedEffort(null);
		setMode(null);
	}
	function chooseModel(id: string): void {
		// Keep the chosen effort when the new model has that level too.
		const levels = models().find((item) => item.id === id)?.efforts ?? [];
		if (!levels.some((level) => level.id === effort())) setPickedEffort(null);
		else setPickedEffort(effort());
		setPickedModel(id);
	}

	async function saveRole(draft: Parameters<typeof rolesStore.create>[1]): Promise<void> {
		const token = auth.token();
		if (!token) throw new Error("Sign in again to save the role");
		const target = editing()?.role;
		const saved = target
			? await rolesStore.update(token, target.id, draft, roleScope())
			: await rolesStore.create(token, draft, roleScope());
		applied = null;
		pickRole(saved.id);
	}

	// Where the new thread will work: chosen in the git control, the folder unless changed.
	const [place, setPlace] = createSignal<WorkPlace>({ worktree: false, branch: "" });

	async function start(text: string, files: File[]): Promise<boolean> {
		const token = auth.token();
		const provider = chosen();
		if (!token || !provider || !props.project || !props.folder) return false;
		setError(null);
		const scope = placementsStore.scopeOf(props.project);
		let created: ChatSession | undefined;
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
					worktree: place().worktree,
					...(place().worktree && place().branch.trim() ? { branch: place().branch.trim() } : {}),
					...(role() ? { role: role()?.id } : {}),
				},
				placementsStore.scopeOf(props.project),
			);
			created = session;
			// A role's choices are the role's: the next thread without one starts from your own.
			if (!role()) {
				remember(AGENT_KEY, provider.id);
				remember(modelKey(provider.id), model());
				remember(effortKey(provider.id), effort());
			}
			const attachments = await chatService.upload(
				token,
				session.id,
				files,
				placementsStore.scopeOf(props.project),
			);
			queueFirstMessage(
				session.id,
				text,
				attachments.map((item) => item.id),
			);
			created = undefined;
			props.onCreated(session);
			return true;
		} catch (cause) {
			let message = cause instanceof Error ? cause.message : "Could not start the chat";
			if (created) {
				try {
					await chatService.remove(token, created.id, scope);
				} catch {
					message += " The empty chat could not be removed; delete it from the thread list.";
				}
			}
			// A teammate removed the role: read the team again and start without it.
			if (role() && /role is gone/i.test(message)) {
				void rolesStore.reload(token, roleScope());
				pickRole(null);
			}
			setError(message);
			return false;
		}
	}

	// Slash commands: which apply on this screen, and what each one does. No agent is running yet
	// here, so nothing of its own is offered until the thread is open.
	const commands = () =>
		availableCommands({
			running: false,
			models: models().length > 0,
			modes: (chosen()?.modes.length ?? 0) > 0,
			efforts: efforts().length > 0,
			project: Boolean(props.project),
		});

	async function addNote(text: string): Promise<void> {
		const token = auth.token();
		const slug = props.project;
		if (!token || !slug) {
			notify({ title: "Open a project to add notes", tone: "danger" });
			return;
		}
		try {
			await notesStore.add(token, slug, { body: text, source: chosen()?.name ?? "Composer" });
			notify({
				title: "Added to notes",
				tone: "success",
				action: { label: "Open", run: () => navigate(`/notes/${slug}`) },
			});
		} catch (cause) {
			notify({
				title: cause instanceof Error ? cause.message : "Could not add the note",
				tone: "danger",
			});
		}
	}

	function runCommand(command: SlashCommand, argument: string): boolean {
		const slug = props.project;
		// No `newThread`: this screen is the new thread already.
		return runSlashCommand(command, argument, {
			running: false,
			// With a role, the model is in its settings.
			openModel: role() ? roleSettings?.open : modelPicker?.open,
			openMode: modePicker?.open,
			efforts: efforts(),
			setEffort: setPickedEffort,
			addTask: slug
				? (title) => void addBoardTask({ token: auth.token(), project: slug, title, workspace })
				: undefined,
			addNote: slug ? (text) => void addNote(text) : undefined,
		});
	}

	const ready = () => Boolean(chosen() && props.project && props.folder);

	return (
		<div class="flex min-h-0 flex-1 flex-col justify-end overflow-y-auto px-3 pb-3 md:justify-center md:px-6 md:pt-12 md:pb-24">
			<Stack gap={4} class="mx-auto w-full max-w-160">
				{/* The project the thread starts in (Figma "First thread"): its tile, where it lives and
				    how many threads it has, and its name. */}
				<Show
					when={project()}
					fallback={
						<Text as="h1" size="headline" tone="strong" weight="medium" class="text-center">
							What should we work on?
						</Text>
					}
				>
					{(current) => (
						<div class="flex items-center gap-3 px-1">
							<ProjectTile>
								<ProjectIcon project={current()} class="size-5" />
							</ProjectTile>
							<div class="flex min-w-0 flex-col">
								<Text size="caption" tone="subtle" truncate>
									{[
										threadsStore.threads(current().slug).length
											? `${threadsStore.threads(current().slug).length} threads`
											: "No threads yet",
										props.folder ? props.folder.replace(/^\/home\/[^/]+/, "~") : null,
									]
										.filter(Boolean)
										.join(" · ")}
								</Text>
								<Text as="h1" size="headline" tone="strong" weight="medium" truncate>
									{current().name}
								</Text>
							</div>
						</div>
					)}
				</Show>
				<Show when={error()}>{(message) => <Alert tone="danger" title={message()} />}</Show>
				<Show when={!props.folder && props.project}>
					<Alert
						tone="accent"
						title="Choose this project's folder"
						action={
							<Button variant="primary" size="sm" onClick={() => props.onChooseFolder()}>
								Choose folder
							</Button>
						}
					>
						A project is a folder: its threads work inside it.
					</Alert>
				</Show>
				{/* Suggestions sit above the composer as chips: a row to scroll on phones, wrapped on desktop. */}
				<Stack gap={3}>
					<Show when={ready()}>
						<Suggestions
							items={SUGGESTIONS.map((item) => ({ icon: item.icon(), label: item.label.trim() }))}
							onPick={(label) =>
								composer?.fill(
									SUGGESTIONS.find((item) => item.label.trim() === label)?.label ?? label,
								)
							}
						/>
					</Show>
					<Show
						when={available().length > 0 || props.providers.length === 0}
						fallback={
							<Alert tone="warning" title="No agent is available on this project's machine">
								Install and sign in one in Settings → Agents, or turn one on there.
							</Alert>
						}
					>
						<Composer
							project={props.project}
							initial={initial}
							commands={commands()}
							onCommand={runCommand}
							control={(control) => {
								composer = control;
							}}
							running={false}
							placeholder={
								role() ? `Describe a task for your ${role()?.name.toLowerCase()}…` : undefined
							}
							disabled={!chosen() || !props.project || !props.folder}
							onSend={start}
							header={
								<>
									<Show when={props.folder && props.project}>
										<GitControl
											folder={props.folder ?? ""}
											scope={placementsStore.scopeOf(props.project)}
											place={place()}
											onPlace={setPlace}
										/>
									</Show>
								</>
							}
							controls={
								<Show when={chosen()}>
									{(provider) => (
										<>
											<Show when={rolesStore.loaded(roleScope())}>
												<RoleChipGroup>
													<RoleMenu
														roles={roles()}
														usable={offered}
														providers={props.providers}
														value={role()?.id ?? null}
														onPick={pickRole}
														onNew={() => setEditing({ role: null })}
														onEdit={(target) => setEditing({ role: target })}
													/>
													<Show when={role()}>
														{(current) => (
															<RoleSettings
																role={current()}
																agents={available()}
																agent={provider().id}
																onAgent={chooseAgent}
																models={models()}
																model={model()}
																onModel={chooseModel}
																efforts={efforts()}
																effort={effort()}
																onEffort={setPickedEffort}
																changed={roleChanged()}
																onSave={async () => {
																	const token = auth.token();
																	if (!token) throw new Error("Sign in again to save the role");
																	const saved = await rolesStore.update(
																		token,
																		current().id,
																		roleChanges(),
																		roleScope(),
																	);
																	applyRole(saved);
																}}
																control={(control) => {
																	roleSettings = control;
																}}
																onEdit={() => setEditing({ role: current() })}
															/>
														)}
													</Show>
												</RoleChipGroup>
											</Show>
											<Show when={!role()}>
												<ModelPicker
													agents={available()}
													agent={provider().id}
													onAgent={chooseAgent}
													models={models()}
													model={model() ?? ""}
													onModel={chooseModel}
													efforts={efforts()}
													effort={effort()}
													onEffort={setPickedEffort}
													control={(control) => {
														modelPicker = control;
													}}
												/>
											</Show>
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
													control={(control) => {
														modePicker = control;
													}}
												/>
											</Show>
										</>
									)}
								</Show>
							}
						/>
					</Show>
				</Stack>
			</Stack>
			<RoleDialog
				open={editing() !== null}
				target={editing()?.role ?? null}
				agents={available()}
				onClose={() => setEditing(null)}
				onSave={saveRole}
				onDelete={async () => {
					const token = auth.token();
					const target = editing()?.role;
					if (!token || !target) return;
					await rolesStore.remove(token, target.id, roleScope());
					if (roleId() === target.id) pickRole(null);
				}}
			/>
		</div>
	);
}
