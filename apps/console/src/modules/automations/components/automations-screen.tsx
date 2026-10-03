import { useMatch, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, createSignal, For, Show, untrack } from "solid-js";

import {
	AgentLogo,
	Alert,
	AutomationGroupLabel,
	AutomationListRow,
	AutomationPanelRow,
	Button,
	ClockIcon,
	ConfirmDialog,
	EmptyState,
	IconButton,
	notify,
	PlusIcon,
	RunBars,
	Segmented,
	Skeleton,
	Stack,
	TemplateRow,
	Text,
	UpNextCard,
	UpNextRow,
} from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";
import { useAuth } from "@/modules/auth";
import { rolesStore } from "@/modules/chat/stores/roles";
import { agentName, offeredProviders, providersStore } from "@/modules/chat/stores/providers";
import { useWorkspace } from "@/modules/projects";
import { ShellSlot, useShell } from "@/modules/shell";

import { runMark, triggerLine, upNext, upNextWhen, whenWord } from "../lib/automation-look";
import { newTrigger } from "../lib/triggers";
import {
	automationsService,
	DEFAULT_OPTIONS,
	type Automation,
	type AutomationInput,
	type AutomationRun,
	type Template,
} from "../services/automations.service";
import { AutomationDetail } from "./automation-detail";
import { AutomationEditor } from "./automation-editor";

type Filter = "all" | "active" | "paused";

/** While a run is going, the list and the open runs are read again this often. */
const RUNNING_POLL_MS = 4_000;
const LAST_RUNS = 5;

function blank(project: string): AutomationInput {
	return {
		name: "",
		prompt: "",
		provider: "",
		model: null,
		effort: null,
		mode: null,
		project,
		workspaceMode: "folder",
		enabled: true,
		triggers: [newTrigger("daily")],
		options: { ...DEFAULT_OPTIONS },
	};
}

function fromTemplate(template: Template, project: string): AutomationInput {
	return {
		...blank(project),
		name: template.name,
		prompt: template.prompt,
		triggers: [newTrigger(template.event ?? template.cadence ?? "daily")],
		options: { ...DEFAULT_OPTIONS, icon: template.icon ?? null },
	};
}

function reason(cause: unknown): string {
	return cause instanceof Error ? cause.message : "The runner could not finish that action";
}

/**
 * Saved jobs an agent runs on its own, on a schedule or when something happens on GitHub (Figma 20
 * · Automations). The panel lists them, Active then Paused; one opened reads as a recipe with its
 * guardrails, runs and last run. Each has its own address (`/automations/<id>`); phones list them
 * first, with what runs next and each one's last runs, and templates to start from.
 */
export function AutomationsScreen(): JSX.Element {
	const auth = useAuth(),
		workspace = useWorkspace(),
		shell = useShell(),
		navigate = useNavigate();
	const match = useMatch(() => "/automations/:id?");
	const openId = () => match()?.params.id ?? null;
	const href = (id: string) => workspaceHref(`/automations/${id}`);

	const [items, setItems] = createSignal<Automation[]>([]);
	const [templates, setTemplates] = createSignal<Template[]>([]);
	const [loaded, setLoaded] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);
	const [busy, setBusy] = createSignal(false);
	const [editing, setEditing] = createSignal<{ id: string | null; value: AutomationInput } | null>(
		null,
	);
	const [runs, setRuns] = createSignal<AutomationRun[] | null>(null);
	const [deleting, setDeleting] = createSignal<Automation | null>(null);
	const [filter, setFilter] = createSignal<Filter>("all");
	const [revision, setRevision] = createSignal(0);
	let requestId = 0;

	const agents = () => offeredProviders(providersStore.providers());
	const opened = () => items().find((item) => item.id === openId()) ?? null;
	const active = createMemo(() => items().filter((item) => item.enabled));
	const paused = createMemo(() => items().filter((item) => !item.enabled));
	const shown = () =>
		filter() === "active"
			? active()
			: filter() === "paused"
				? paused()
				: [...active(), ...paused()];
	const roleName = (item: Automation) =>
		rolesStore.roles().find((role) => role.id === item.options.role)?.name;
	const running = () => items().some((item) => item.lastRun?.status === "running");
	const projectName = (slug: string) =>
		workspace.projects().find((project) => project.slug === slug)?.name ?? slug;
	const linkedProjects = () =>
		workspace
			.projects()
			.filter((project) => Boolean(workspace.folders()[project.slug]))
			.map((project) => ({ value: project.slug, label: project.name }));
	const ownerName = (item: Automation) => {
		const user = auth.user();
		return user && user.id === item.ownerId ? user.username : null;
	};

	async function load(): Promise<void> {
		const token = auth.token(),
			id = ++requestId;
		if (!token) return;
		try {
			const [list, templateList] = await Promise.all([
				automationsService.list(token),
				automationsService.templates(token),
			]);
			if (id !== requestId) return;
			setItems(list);
			setTemplates(templateList);
			setError(null);
		} catch (cause) {
			if (id === requestId) setError(reason(cause));
		} finally {
			if (id === requestId) setLoaded(true);
		}
	}
	createEffect(
		() => auth.token(),
		(token) => {
			setItems([]);
			setEditing(null);
			setLoaded(false);
			if (token) {
				void load();
				void providersStore.load(token);
				void rolesStore.load(token);
			}
		},
	);

	// The open one's runs, read again when it changes or a run of it starts or ends.
	createEffect(
		() => [auth.token(), openId(), revision()] as const,
		([token, id]) => {
			if (!token || !id) {
				setRuns(null);
				return;
			}
			void automationsService.runs(token, id).then(
				(history) => {
					if (untrack(openId) === id) setRuns(history);
				},
				(cause) => {
					if (untrack(openId) !== id) return;
					setRuns([]);
					setError(reason(cause));
				},
			);
		},
	);
	createEffect(running, (live) => {
		if (!live) return;
		const timer = setInterval(() => {
			void load();
			setRevision((n) => n + 1);
		}, RUNNING_POLL_MS);
		return () => clearInterval(timer);
	});

	function create(template?: Template): void {
		const project = workspace.currentSlug() ?? linkedProjects()[0]?.value ?? "";
		setEditing({ id: null, value: template ? fromTemplate(template, project) : blank(project) });
		setError(null);
	}
	function edit(item: Automation): void {
		setEditing({ id: item.id, value: { ...item, options: { ...item.options } } });
		setError(null);
	}

	async function save(input: AutomationInput): Promise<void> {
		const token = auth.token(),
			target = editing();
		if (!token || !target || busy()) return;
		setBusy(true);
		setError(null);
		try {
			const saved = target.id
				? await automationsService.update(token, target.id, input)
				: await automationsService.create(token, input);
			setEditing(null);
			notify({ title: target.id ? "Automation saved" : "Automation created" });
			await load();
			if (!target.id) navigate(href(saved.id));
		} catch (cause) {
			setError(reason(cause));
		} finally {
			setBusy(false);
		}
	}

	async function act(kind: "toggle" | "run" | "delete", item: Automation): Promise<void> {
		const token = auth.token();
		if (!token || busy()) return;
		setBusy(true);
		setError(null);
		try {
			if (kind === "toggle") await automationsService.toggle(token, item.id);
			else if (kind === "delete") await automationsService.delete(token, item.id);
			else {
				const run = await automationsService.run(token, item.id);
				notify({
					title: run.status === "skipped" ? "Run skipped" : "Run started",
					description: run.error ?? `${item.name} is running in ${projectName(item.project)}.`,
				});
			}
			if (kind === "delete") {
				setDeleting(null);
				if (openId() === item.id) navigate(workspaceHref("/automations"));
			}
			await load();
			setRevision((n) => n + 1);
		} catch (cause) {
			setError(reason(cause));
			if (kind === "delete") setDeleting(null);
		} finally {
			setBusy(false);
		}
	}

	function openRun(item: Automation, run: AutomationRun): void {
		if (!run.sessionId) return;
		navigate(workspaceHref(`/chat/${item.project}/${run.sessionId}`));
	}

	const who = (item: Automation) => (
		<AgentLogo id={item.provider} name={agentName(item.provider)} />
	);
	const panelRows = (list: readonly Automation[]) => (
		<For each={list} keyed={(item) => item.id}>
			{(item) => (
				<AutomationPanelRow
					href={href(item().id)}
					title={item().name}
					time={whenWord(item())}
					line={triggerLine(item().triggers[0])}
					glyph={item().options.icon}
					who={who(item())}
					paused={!item().enabled}
					current={openId() === item().id}
				/>
			)}
		</For>
	);
	const loading = () => (
		<Stack gap={2} class="p-2">
			<Skeleton class="h-12" />
			<Skeleton class="h-12" />
			<Skeleton class="h-12" />
		</Stack>
	);
	const problem = () => (
		<Show when={error() && !editing()}>
			<div class="p-2">
				<Alert
					tone="danger"
					title={error() as string}
					action={
						<Button size="sm" onClick={() => void load()}>
							Try again
						</Button>
					}
				/>
			</div>
		</Show>
	);
	const templateRows = () => (
		<For each={templates()}>
			{(template) => (
				<TemplateRow
					title={template.name}
					description={
						template.description ??
						triggerLine(newTrigger(template.event ?? template.cadence ?? "daily"))
					}
					glyph={template.icon ?? null}
					action={
						<IconButton
							label={`Start from ${template.name}`}
							variant="secondary"
							shape="round"
							size={shell.desktop() ? "md" : "lg"}
							onClick={() => create(template)}
						>
							<PlusIcon />
						</IconButton>
					}
				/>
			)}
		</For>
	);
	const empty = () => (
		<EmptyState
			icon={<ClockIcon size="md" />}
			title="Let an agent take the recurring work"
			description="Run a job every night, every week, or whenever a pull request needs a look. Each run is a thread you can open."
			action={
				<Button size="sm" variant="primary" onClick={() => create()}>
					<PlusIcon size="sm" /> New automation
				</Button>
			}
		/>
	);
	const listing = () => !shell.desktop() && openId() === null;

	return (
		<div class="flex min-h-0 flex-1 flex-col">
			<ShellSlot name="panelActions">
				<IconButton label="New automation" size="sm" onClick={() => create()}>
					<PlusIcon size="sm" />
				</IconButton>
			</ShellSlot>
			{/* The panel: what is on, then what is paused. */}
			<ShellSlot name="panel">
				<Show when={loaded()} fallback={loading()}>
					<Show when={active().length}>
						<AutomationGroupLabel>Active</AutomationGroupLabel>
						{panelRows(active())}
					</Show>
					<Show when={paused().length}>
						<AutomationGroupLabel>Paused</AutomationGroupLabel>
						{panelRows(paused())}
					</Show>
					<Show when={!items().length && !error()}>
						<Text size="caption" tone="subtle" class="px-2 py-2">
							No automations yet.
						</Text>
					</Show>
				</Show>
			</ShellSlot>
			<Show when={listing()}>
				<ShellSlot name="heading">
					<div class="flex min-w-0 flex-col items-center">
						<Text as="h1" tone="strong" weight="medium" size="body-lg" truncate>
							Automations
						</Text>
						<Text size="caption" tone="subtle" truncate>
							{loaded() ? `${active().length} active` : "Automations"}
						</Text>
					</div>
				</ShellSlot>
				<ShellSlot name="trailing">
					<IconButton
						label="New automation"
						variant="secondary"
						shape="round"
						size="lg"
						onClick={() => create()}
					>
						<PlusIcon />
					</IconButton>
				</ShellSlot>
			</Show>

			<Show
				when={opened()}
				fallback={
					<Show
						when={listing()}
						fallback={
							<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
								{problem()}
								<Show when={loaded() && !(openId() && !items().length)}>
									<div class="mx-auto flex w-full max-w-120 flex-col gap-6 px-4 py-12">
										<Show when={items().length} fallback={<Show when={!error()}>{empty()}</Show>}>
											<EmptyState
												icon={<ClockIcon size="md" />}
												title={openId() ? "This automation is gone" : "Open an automation"}
												description="Its recipe, guardrails, runs and last run show here."
											/>
										</Show>
										<Show when={templates().length}>
											<div class="flex flex-col">
												<AutomationGroupLabel phone>Start from a template</AutomationGroupLabel>
												{templateRows()}
											</div>
										</Show>
									</div>
								</Show>
							</div>
						}
					>
						{/* Phones: All, Active and Paused, what runs next, then each one's last runs. */}
						<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-2 pb-6">
							<Segmented<Filter>
								block
								label="Which automations"
								value={filter()}
								onChange={setFilter}
								options={(
									[
										["all", "All", items().length],
										["active", "Active", active().length],
										["paused", "Paused", paused().length],
									] as const
								).map(([value, label, count]) => ({
									value,
									label,
									count: loaded() ? count : undefined,
									countTone: "quiet" as const,
								}))}
							/>
							{problem()}
							<Show when={loaded()} fallback={loading()}>
								<Show when={filter() !== "paused" && upNext(items()).length}>
									<div class="pt-3">
										<UpNextCard
											note={
												upNextWhen(upNext(items())[0]?.nextRunAt ?? "").day ? undefined : "Today"
											}
										>
											<For each={upNext(items())}>
												{(item) => (
													<UpNextRow
														{...upNextWhen(item.nextRunAt as string)}
														href={href(item.id)}
														title={item.name}
														line={[roleName(item), agentName(item.provider)]
															.filter(Boolean)
															.join(" · ")}
														who={who(item)}
														glyph={item.options.icon}
													/>
												)}
											</For>
										</UpNextCard>
									</div>
								</Show>
								<Show when={items().length} fallback={<Show when={!error()}>{empty()}</Show>}>
									<AutomationGroupLabel phone note={`Last ${LAST_RUNS} runs`}>
										Automations
									</AutomationGroupLabel>
									<div class="flex flex-col">
										<For each={shown()} keyed={(item) => item.id}>
											{(item) => (
												<AutomationListRow
													href={href(item().id)}
													title={item().name}
													line={
														item().enabled
															? triggerLine(item().triggers[0])
															: `Paused · ${triggerLine(item().triggers[0]).toLowerCase()}`
													}
													glyph={item().options.icon}
													who={who(item())}
													paused={!item().enabled}
													trailing={
														<RunBars
															label={`Last ${LAST_RUNS} runs`}
															marks={[
																...(item().recent ?? []).slice(-LAST_RUNS).map(runMark),
																...Array.from(
																	{
																		length: Math.max(
																			0,
																			LAST_RUNS - (item().recent ?? []).slice(-LAST_RUNS).length,
																		),
																	},
																	() => "empty" as const,
																),
															]}
														/>
													}
												/>
											)}
										</For>
									</div>
								</Show>
								<Show when={templates().length}>
									<AutomationGroupLabel phone>Start from a template</AutomationGroupLabel>
									<div class="flex flex-col">{templateRows()}</div>
								</Show>
							</Show>
						</div>
					</Show>
				}
			>
				{(item) => (
					<AutomationDetail
						item={item()}
						projectName={projectName(item().project)}
						agents={agents()}
						roles={rolesStore.roles()}
						runs={runs()}
						ownerName={ownerName(item())}
						busy={busy()}
						error={editing() ? null : error()}
						reviewHref={(pull) => workspaceHref(`/pulls/${item().project}/${pull}`)}
						onBack={() => navigate(workspaceHref("/automations"))}
						onEdit={() => edit(item())}
						onDelete={() => setDeleting(item())}
						onRun={() => void act("run", item())}
						onToggle={() => void act("toggle", item())}
						onOpenRun={(run) => openRun(item(), run)}
					/>
				)}
			</Show>

			<Show when={editing()}>
				{(target) => (
					<AutomationEditor
						value={target().value}
						isNew={target().id === null}
						projects={linkedProjects()}
						agents={agents()}
						roles={rolesStore.roles()}
						busy={busy()}
						error={error()}
						onClose={() => {
							setEditing(null);
							setError(null);
						}}
						onSave={(input) => void save(input)}
					/>
				)}
			</Show>

			<ConfirmDialog
				open={deleting() !== null}
				onClose={() => setDeleting(null)}
				onConfirm={() => {
					const item = deleting();
					if (item) void act("delete", item);
				}}
				title="Delete this automation?"
				description="Its schedule and run history go. The threads its runs made stay in the project."
				confirm="Delete"
				danger
				pending={busy()}
				stayOpen
			/>
		</div>
	);
}
