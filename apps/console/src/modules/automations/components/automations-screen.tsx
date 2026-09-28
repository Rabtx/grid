import { useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, Show } from "solid-js";

import {
	Alert,
	Button,
	ClockIcon,
	ConfirmDialog,
	EmptyState,
	IconButton,
	iconButton,
	ListRow,
	Menu,
	MoreIcon,
	notify,
	PaneHeader,
	PlusIcon,
	PullRequestIcon,
	Row,
	Skeleton,
	Stack,
	StatusDot,
	Text,
} from "@/kit";
import type { PopoverControl } from "@/kit/popover";
import { workspaceHref } from "@/lib/active-workspace";
import { useAuth } from "@/modules/auth";
import { offeredProviders, providersStore } from "@/modules/chat/stores/providers";
import { useWorkspace } from "@/modules/projects";
import { relativeTime } from "@/modules/projects/lib/relative-time";

import {
	describeTrigger,
	describeTriggers,
	newTrigger,
	onGithub,
	untilLabel,
} from "../lib/triggers";
import {
	automationsService,
	type Automation,
	type AutomationInput,
	type AutomationRun,
	type Template,
} from "../services/automations.service";
import { AutomationDetail } from "./automation-detail";
import { AutomationEditor } from "./automation-editor";

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
	};
}

function fromTemplate(template: Template, project: string): AutomationInput {
	return {
		...blank(project),
		name: template.name,
		prompt: template.prompt,
		triggers: [newTrigger(template.event ?? template.cadence ?? "daily")],
	};
}

function reason(cause: unknown): string {
	return cause instanceof Error ? cause.message : "The runner could not finish that action";
}

/** "2 active · 1 paused", or nothing while there is nothing to count. */
function tally(items: readonly Automation[]): string | undefined {
	if (!items.length) return undefined;
	const active = items.filter((item) => item.enabled).length;
	const paused = items.length - active;
	return [active && `${active} active`, paused && `${paused} paused`].filter(Boolean).join(" · ");
}

/**
 * Saved jobs an agent runs on its own, on a schedule or when something happens on GitHub; each
 * run is an ordinary thread in its project. The list shows what each does and when it runs next;
 * opening one shows its setup and recent runs. Templates are a head start.
 */
export function AutomationsScreen(): JSX.Element {
	const auth = useAuth(),
		workspace = useWorkspace(),
		navigate = useNavigate();
	const [items, setItems] = createSignal<Automation[]>([]);
	const [templates, setTemplates] = createSignal<Template[]>([]);
	const [loaded, setLoaded] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);
	const [busy, setBusy] = createSignal(false);
	const [editing, setEditing] = createSignal<{ id: string | null; value: AutomationInput } | null>(
		null,
	);
	const [openId, setOpenId] = createSignal<string | null>(null);
	const [runs, setRuns] = createSignal<AutomationRun[] | null>(null);
	const [deleting, setDeleting] = createSignal<Automation | null>(null);
	let requestId = 0;

	const agents = () => offeredProviders(providersStore.providers());
	const opened = () => items().find((item) => item.id === openId()) ?? null;
	const projectName = (slug: string) =>
		workspace.projects().find((project) => project.slug === slug)?.name ?? slug;
	const linkedProjects = () =>
		workspace
			.projects()
			.filter((project) => Boolean(workspace.folders()[project.slug]))
			.map((project) => ({ value: project.slug, label: project.name }));

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
			setOpenId(null);
			setEditing(null);
			setLoaded(false);
			if (token) {
				void load();
				void providersStore.load(token);
			}
		},
	);

	function create(template?: Template): void {
		const project = workspace.currentSlug() ?? linkedProjects()[0]?.value ?? "";
		setEditing({ id: null, value: template ? fromTemplate(template, project) : blank(project) });
		setError(null);
	}
	function edit(item: Automation): void {
		setEditing({ id: item.id, value: { ...item } });
		setError(null);
	}

	async function save(input: AutomationInput): Promise<void> {
		const token = auth.token(),
			target = editing();
		if (!token || !target || busy()) return;
		setBusy(true);
		setError(null);
		try {
			if (target.id) await automationsService.update(token, target.id, input);
			else await automationsService.create(token, input);
			setEditing(null);
			notify({ title: target.id ? "Automation saved" : "Automation created" });
			await load();
		} catch (cause) {
			setError(reason(cause));
		} finally {
			setBusy(false);
		}
	}

	async function open(item: Automation): Promise<void> {
		setOpenId(item.id);
		setRuns(null);
		setError(null);
		const token = auth.token();
		if (!token) return;
		try {
			const history = await automationsService.runs(token, item.id);
			if (openId() === item.id) setRuns(history);
		} catch (cause) {
			if (openId() === item.id) {
				setRuns([]);
				setError(reason(cause));
			}
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
				if (openId() === item.id) setOpenId(null);
			}
			await load();
			if (openId() === item.id) void open(item);
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

	return (
		<div class="flex min-h-0 flex-1 flex-col">
			<PaneHeader
				title="Automations"
				detail={tally(items())}
				actions={
					<IconButton size="sm" label="New automation" onClick={() => create()}>
						<PlusIcon />
					</IconButton>
				}
			/>
			{/* Rows edge to edge under the header, as Notes and Inbox lay theirs out. */}
			<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5 pb-safe md:p-2">
				<Show when={error() && !openId() && !editing()}>
					<Alert
						tone="danger"
						title={error() as string}
						action={
							<Button size="sm" onClick={() => void load()}>
								Try again
							</Button>
						}
					/>
				</Show>

				<Show
					when={loaded()}
					fallback={
						<Stack gap={1.5} class="p-1">
							<Skeleton class="h-12" />
							<Skeleton class="h-12" />
							<Skeleton class="h-12" />
						</Stack>
					}
				>
					<Show
						when={items().length > 0}
						fallback={
							<Show when={!error()}>
								<EmptyState
									icon={<ClockIcon size="md" />}
									title="Let an agent take the recurring work"
									description="Run a job every morning, every week, or whenever a pull request needs a look. Each run is a thread you can open."
									action={
										<Button size="sm" variant="primary" onClick={() => create()}>
											<PlusIcon size="sm" /> New automation
										</Button>
									}
								/>
							</Show>
						}
					>
						<For each={items()}>
							{(item) => (
								<AutomationRow
									item={item}
									projectName={projectName(item.project)}
									onOpen={() => void open(item)}
									onEdit={() => edit(item)}
									onRun={() => void act("run", item)}
									onToggle={() => void act("toggle", item)}
									onDelete={() => setDeleting(item)}
								/>
							)}
						</For>
					</Show>
				</Show>

				<Show when={loaded() && templates().length > 0}>
					<Text size="caption" tone="subtle" class="block px-2.5 pt-4 pb-1">
						{items().length ? "Templates" : "Start from a template"}
					</Text>
					<For each={templates()}>
						{(template) => (
							<ListRow
								icon={template.event ? <PullRequestIcon size="sm" /> : <ClockIcon size="sm" />}
								title={template.name}
								subtitle={`${describeTrigger(newTrigger(template.event ?? template.cadence ?? "daily"))} · ${template.prompt}`}
								onClick={() => create(template)}
							/>
						)}
					</For>
				</Show>
			</div>

			<Show when={opened()}>
				{(item) => (
					<AutomationDetail
						item={item()}
						projectName={projectName(item().project)}
						agents={agents()}
						runs={runs()}
						busy={busy()}
						error={error()}
						onClose={() => {
							setOpenId(null);
							setError(null);
						}}
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

/**
 * One automation in the list: a clock or a pull request for how it starts, what it does and where,
 * and on the right when it runs next (or that it is paused, or that its last run failed). Its
 * actions sit behind ⋯ on hover, and a long press on touch.
 */
function AutomationRow(props: {
	item: Automation;
	projectName: string;
	onOpen: () => void;
	onEdit: () => void;
	onRun: () => void;
	onToggle: () => void;
	onDelete: () => void;
}): JSX.Element {
	let menu: PopoverControl | undefined;
	const last = () => props.item.lastRun;
	const when = () => {
		if (props.item.nextRunAt) return untilLabel(props.item.nextRunAt);
		const started = last()?.startedAt;
		return started ? relativeTime(started) : "";
	};
	const trailing = (): JSX.Element => {
		if (!props.item.enabled) return "Paused";
		if (last()?.status === "running")
			return (
				<Row gap={1.5}>
					<StatusDot status="running" size="sm" /> Running
				</Row>
			);
		return (
			<Row gap={1.5}>
				<Show when={last()?.status === "failed"}>
					<StatusDot status="error" size="sm" label="Last run failed" />
				</Show>
				{when()}
			</Row>
		);
	};
	return (
		<ListRow
			icon={onGithub(props.item.triggers) ? <PullRequestIcon size="sm" /> : <ClockIcon size="sm" />}
			title={props.item.name}
			subtitle={`${props.projectName} · ${describeTriggers(props.item.triggers)}`}
			trailing={trailing()}
			onClick={props.onOpen}
			onMenuAt={(point) => menu?.open(point)}
			actions={
				<Menu
					label={`Actions for ${props.item.name}`}
					trigger={<MoreIcon size="sm" />}
					triggerClass={iconButton({ size: "xs" })}
					placement="bottom-end"
					pointerOnly
					control={(control) => {
						menu = control;
					}}
					groups={[
						{
							items: [
								{ id: "run", label: "Run now" },
								{ id: "edit", label: "Edit" },
								{ id: "toggle", label: props.item.enabled ? "Pause" : "Resume" },
							],
						},
						{ items: [{ id: "delete", label: "Delete", danger: true }] },
					]}
					onSelect={(id) => {
						if (id === "run") props.onRun();
						else if (id === "edit") props.onEdit();
						else if (id === "toggle") props.onToggle();
						else props.onDelete();
					}}
				/>
			}
		/>
	);
}
