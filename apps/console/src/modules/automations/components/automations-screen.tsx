import { useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, Show, untrack } from "solid-js";

import {
	Alert,
	Button,
	ConfirmDialog,
	Dialog,
	EmptyState,
	Field,
	iconButton,
	Input,
	ListRow,
	Menu,
	PaneHeader,
	PlusIcon,
	PromptBox,
	PROMPT_FIELD,
	Select,
	Skeleton,
	Switch,
	Text,
} from "@/kit";
import type { PopoverControl } from "@/kit/popover";
import { workspaceHref } from "@/lib/active-workspace";
import { useAuth } from "@/modules/auth";
import { providersStore } from "@/modules/chat/stores/providers";
import { useWorkspace } from "@/modules/projects";

import {
	automationsService,
	type Automation,
	type AutomationInput,
	type AutomationRun,
	type Template,
	type Trigger,
} from "../services/automations.service";

const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const KINDS = [
	{ value: "hourly", label: "Hourly" },
	{ value: "daily", label: "Daily" },
	{ value: "weekdays", label: "Weekdays" },
	{ value: "weekly", label: "Weekly" },
	{ value: "pull_opened", label: "Pull request opened" },
	{ value: "review_requested", label: "Review requested from me" },
	{ value: "checks_failed", label: "Checks failed on my pull request" },
] as const;

function triggerKind(trigger: Trigger): string {
	return trigger.kind === "event" ? trigger.event : trigger.cadence;
}
function newTrigger(kind: string): Trigger {
	if (kind === "pull_opened" || kind === "review_requested" || kind === "checks_failed")
		return { kind: "event", event: kind };
	if (kind === "hourly") return { kind: "schedule", cadence: "hourly", minute: 0, timezone: ZONE };
	return {
		kind: "schedule",
		cadence: kind as "daily" | "weekdays" | "weekly",
		time: "09:00",
		...(kind === "weekly" ? { day: 1 } : {}),
		timezone: ZONE,
	};
}
function describe(trigger: Trigger): string {
	if (trigger.kind === "event")
		return KINDS.find((kind) => kind.value === trigger.event)?.label ?? trigger.event;
	if (trigger.cadence === "hourly")
		return `Hourly at :${String(trigger.minute).padStart(2, "0")} · ${trigger.timezone}`;
	return `${trigger.cadence === "weekly" ? `${DAY[trigger.day ?? 1]}s` : trigger.cadence} ${trigger.time} · ${trigger.timezone}`;
}
function nextLabel(at: string | null): string {
	if (!at) return "";
	const minutes = Math.max(0, Math.ceil((Date.parse(at) - Date.now()) / 60_000));
	if (minutes < 60) return `in ${minutes} min`;
	if (minutes < 48 * 60) return `in ${Math.round(minutes / 60)} h`;
	return `in ${Math.round(minutes / 1440)} d`;
}
function initial(project: string): AutomationInput {
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
		...initial(project),
		name: template.name,
		prompt: template.prompt,
		triggers: [newTrigger(template.event ?? template.cadence ?? "daily")],
	};
}
function reason(cause: unknown): string {
	return cause instanceof Error ? cause.message : "The runner could not finish that action";
}

export function AutomationsScreen(): JSX.Element {
	const auth = useAuth(),
		workspace = useWorkspace(),
		navigate = useNavigate();
	const [items, setItems] = createSignal<Automation[]>([]);
	const [templates, setTemplates] = createSignal<Template[]>([]);
	const [loaded, setLoaded] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);
	const [busy, setBusy] = createSignal(false);
	const [editing, setEditing] = createSignal<AutomationInput | null>(null);
	const [editingId, setEditingId] = createSignal<string | null>(null);
	const [selected, setSelected] = createSignal<Automation | null>(null);
	const [runs, setRuns] = createSignal<AutomationRun[]>([]);
	const [deleting, setDeleting] = createSignal(false);
	let requestId = 0;

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
			setLoaded(true);
			setError(null);
			if (selected()) setSelected(list.find((item) => item.id === selected()?.id) ?? null);
		} catch (cause) {
			if (id === requestId) {
				setLoaded(true);
				setError(reason(cause));
			}
		}
	}
	createEffect(
		() => auth.token(),
		(token) => {
			setItems([]);
			setRuns([]);
			setSelected(null);
			setEditing(null);
			setLoaded(false);
			if (token) {
				void load();
				void providersStore.load(token);
			}
		},
	);

	function start(item?: Automation | Template): void {
		const project = workspace.currentSlug() ?? Object.keys(workspace.folders())[0] ?? "";
		setEditingId(item && "id" in item && "workspace" in item ? item.id : null);
		setEditing(
			item && "workspace" in item
				? { ...item }
				: item
					? fromTemplate(item, project)
					: initial(project),
		);
		setError(null);
	}
	async function save(input: AutomationInput): Promise<void> {
		const token = auth.token();
		if (!token || busy()) return;
		const version = requestId;
		setBusy(true);
		setError(null);
		try {
			if (editingId()) await automationsService.update(token, editingId() as string, input);
			else await automationsService.create(token, input);
			if (version !== requestId) return;
			setEditing(null);
			await load();
		} catch (cause) {
			if (version === requestId) setError(reason(cause));
		} finally {
			setBusy(false);
		}
	}
	async function show(item: Automation): Promise<void> {
		setSelected(item);
		setRuns([]);
		const token = auth.token(),
			id = ++requestId;
		if (!token) return;
		try {
			const history = await automationsService.runs(token, item.id);
			if (id === requestId) {
				setRuns(history);
				setError(null);
			}
		} catch (cause) {
			if (id === requestId) setError(reason(cause));
		}
	}
	async function action(kind: "toggle" | "run" | "delete", item: Automation): Promise<void> {
		const token = auth.token();
		if (!token || busy()) return;
		const version = requestId;
		setBusy(true);
		setError(null);
		try {
			if (kind === "toggle") await automationsService.toggle(token, item.id);
			else if (kind === "run") await automationsService.run(token, item.id);
			else await automationsService.delete(token, item.id);
			if (version !== requestId) return;
			if (kind === "delete") {
				setSelected(null);
				setDeleting(false);
			}
			await load();
			if (kind === "run") await show(item);
		} catch (cause) {
			if (version === requestId) {
				setError(reason(cause));
				if (kind === "delete") setDeleting(false);
			}
		} finally {
			setBusy(false);
		}
	}

	return (
		<div class="flex min-h-0 flex-1 flex-col">
			<PaneHeader
				title="Automations"
				detail={`${items().length} saved`}
				actions={
					<Button size="sm" onClick={() => start()}>
						<PlusIcon size="sm" /> New
					</Button>
				}
			/>
			<div class="min-h-0 flex-1 overflow-y-auto p-2 md:p-4">
				<Show when={error()}>
					{(message) => (
						<Alert
							tone="danger"
							title={message()}
							action={
								<Button size="sm" onClick={() => void load()}>
									Try again
								</Button>
							}
						/>
					)}
				</Show>
				<Show
					when={loaded()}
					fallback={
						<div class="flex flex-col gap-2">
							<Skeleton class="h-14" />
							<Skeleton class="h-14" />
							<Skeleton class="h-14" />
						</div>
					}
				>
					<Show
						when={items().length}
						fallback={
							<EmptyState
								title="Let an agent take recurring work"
								description="Choose a template or create a job that runs on a schedule or GitHub event."
								action={<Button onClick={() => start()}>Create automation</Button>}
							/>
						}
					>
						<For each={items()}>
							{(item) => (
								<AutomationRow
									item={item}
									busy={busy()}
									onOpen={() => void show(item)}
									onEdit={() => start(item)}
									onRun={() => void action("run", item)}
									onToggle={() => void action("toggle", item)}
								/>
							)}
						</For>
					</Show>
				</Show>
				<Show when={templates().length && items().length === 0}>
					<div class="mt-6">
						<Text tone="subtle">Start with a template</Text>
						<div class="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
							<For each={templates()}>
								{(template) => (
									<button
										type="button"
										onClick={() => start(template)}
										class="surface-card focus-ring min-h-14 p-3 text-left text-body text-fg hover:bg-fill"
									>
										{template.name}
									</button>
								)}
							</For>
						</div>
					</div>
				</Show>
			</div>
			<Show when={selected()}>
				{(item) => (
					<Dialog
						open={true}
						kind="drawer"
						title={item().name}
						onClose={() => {
							++requestId;
							setSelected(null);
						}}
						footer={
							<>
								<Button variant="ghost" disabled={busy()} onClick={() => start(item())}>
									Edit
								</Button>
								<Button variant="ghost" disabled={busy()} onClick={() => setDeleting(true)}>
									Delete
								</Button>
								<Button disabled={busy()} onClick={() => void action("run", item())}>
									Run now
								</Button>
							</>
						}
					>
						<div class="flex flex-col gap-4">
							<Show when={error()}>{(message) => <Alert tone="danger" title={message()} />}</Show>
							<Text tone="subtle">
								{item().project} · {item().triggers.map(describe).join(" · ")}
							</Text>
							<h3 class="font-medium text-body text-fg">Run history</h3>
							<Show when={runs().length} fallback={<Text tone="subtle">No runs yet.</Text>}>
								<For each={runs()}>
									{(run) => (
										<div class="border-line border-b py-2">
											<Show
												when={run.sessionId}
												fallback={
													<Text>
														{run.status} · {run.error ?? run.trigger}
													</Text>
												}
											>
												<button
													type="button"
													class="focus-ring min-h-11 w-full text-left text-body text-fg hover:text-accent"
													onClick={() =>
														navigate(workspaceHref(`/chat/${item().project}/${run.sessionId}`))
													}
												>
													{run.status} ·{" "}
													{run.startedAt ? new Date(run.startedAt).toLocaleString() : run.trigger}
												</button>
											</Show>
											<Show when={run.error}>
												<Text tone="subtle">{run.error}</Text>
											</Show>
										</div>
									)}
								</For>
							</Show>
						</div>
					</Dialog>
				)}
			</Show>
			<Show when={editing()}>
				{(value) => (
					<AutomationSheet
						value={value()}
						projects={workspace
							.projects()
							.filter((project) => Boolean(workspace.folders()[project.slug]))
							.map((project) => ({ value: project.slug, label: project.name }))}
						providers={providersStore.providers()}
						busy={busy()}
						error={error()}
						onClose={() => setEditing(null)}
						onSave={(input) => void save(input)}
					/>
				)}
			</Show>
			<ConfirmDialog
				open={deleting()}
				onClose={() => setDeleting(false)}
				onConfirm={() => {
					const item = selected();
					if (item) void action("delete", item);
				}}
				title="Delete automation?"
				description="This removes the saved job and its run history. Threads stay in the project."
				confirm="Delete"
				danger
				pending={busy()}
				stayOpen
			/>
		</div>
	);
}

function AutomationRow(props: {
	item: Automation;
	busy: boolean;
	onOpen: () => void;
	onEdit: () => void;
	onRun: () => void;
	onToggle: () => void;
}): JSX.Element {
	let menu: PopoverControl | undefined;
	const status = () => props.item.lastRun?.status ?? "Never run";
	return (
		<div class="flex items-center gap-2">
			<div class="min-w-0 flex-1">
				<ListRow
					title={props.item.name}
					subtitle={`${props.item.project} · ${props.item.triggers.map(describe).join(", ")} · ${status()}`}
					trailing={nextLabel(props.item.nextRunAt)}
					onClick={props.onOpen}
					onMenuAt={(point) => menu?.open(point)}
					actions={
						<Menu
							label={`${props.item.name} actions`}
							trigger="•••"
							triggerClass={iconButton({ size: "sm" })}
							control={(control) => {
								menu = control;
							}}
							groups={[
								{
									items: [
										{ id: "edit", label: "Edit" },
										{ id: "run", label: "Run now" },
										{ id: "toggle", label: props.item.enabled ? "Disable" : "Enable" },
									],
								},
							]}
							onSelect={(id) => {
								if (id === "edit") props.onEdit();
								else if (id === "run") props.onRun();
								else props.onToggle();
							}}
						/>
					}
				/>
			</div>
			<div class="grid min-h-11 min-w-11 place-items-center">
				<Switch
					label={`${props.item.enabled ? "Disable" : "Enable"} ${props.item.name}`}
					checked={props.item.enabled}
					disabled={props.busy}
					onChange={props.onToggle}
				/>
			</div>
		</div>
	);
}

function AutomationSheet(props: {
	value: AutomationInput;
	projects: { value: string; label: string }[];
	providers: {
		id: string;
		name: string;
		available: boolean;
		models: { id: string; name: string; efforts?: { id: string; name: string }[] }[];
		modes: { id: string; name: string }[];
	}[];
	busy: boolean;
	error: string | null;
	onClose: () => void;
	onSave: (value: AutomationInput) => void;
}): JSX.Element {
	const [form, setForm] = createSignal<AutomationInput>(untrack(() => props.value));
	const change = (next: Partial<AutomationInput>) =>
		setForm((current) => ({ ...current, ...next }));
	const agent = () => props.providers.find((provider) => provider.id === form().provider);
	const model = () => agent()?.models.find((choice) => choice.id === form().model);
	const setTrigger = (index: number, trigger: Trigger) =>
		change({
			triggers: form().triggers.map((old, position) => (position === index ? trigger : old)),
		});
	return (
		<Dialog
			open={true}
			kind="drawer"
			title={props.value.name ? "Edit automation" : "New automation"}
			onClose={props.onClose}
			footer={
				<>
					<Button variant="ghost" onClick={props.onClose}>
						Cancel
					</Button>
					<Button disabled={props.busy} onClick={() => props.onSave(form())}>
						{props.busy ? "Saving…" : "Save automation"}
					</Button>
				</>
			}
		>
			<div class="flex flex-col gap-4 pb-6">
				<Show when={props.error}>
					<Alert tone="danger" title={props.error as string} />
				</Show>
				<Field label="Name">
					{(id) => (
						<Input
							id={id}
							maxlength={120}
							value={form().name}
							onInput={(event) => change({ name: event.currentTarget.value })}
						/>
					)}
				</Field>
				<Field label="Prompt">
					{(id) => (
						<PromptBox
							field={
								<textarea
									id={id}
									class={PROMPT_FIELD}
									maxlength={10000}
									value={form().prompt}
									onInput={(event) => change({ prompt: event.currentTarget.value })}
								/>
							}
							send={<span />}
						/>
					)}
				</Field>
				<Field label="Project">
					{() => (
						<Select
							label="Project"
							look="field"
							value={form().project}
							onChange={(project) => change({ project })}
							groups={[{ options: props.projects }]}
						/>
					)}
				</Field>
				<Field label="Agent">
					{() => (
						<Select
							label="Agent"
							look="field"
							value={form().provider}
							onChange={(provider) => change({ provider, model: null, effort: null, mode: null })}
							groups={[
								{
									options: props.providers
										.filter((item) => item.available)
										.map((item) => ({ value: item.id, label: item.name })),
								},
							]}
						/>
					)}
				</Field>
				<Field label="Model">
					{() => (
						<Select
							label="Model"
							look="field"
							value={form().model ?? ""}
							onChange={(model) => change({ model: model || null, effort: null })}
							groups={[
								{
									options: [
										{ value: "", label: "Agent default" },
										...(agent()?.models ?? []).map((choice) => ({
											value: choice.id,
											label: choice.name,
										})),
									],
								},
							]}
						/>
					)}
				</Field>
				<Field label="Effort">
					{() => (
						<Select
							label="Effort"
							look="field"
							value={form().effort ?? ""}
							onChange={(effort) => change({ effort: effort || null })}
							groups={[
								{
									options: [
										{ value: "", label: "Agent default" },
										...(model()?.efforts ?? []).map((choice) => ({
											value: choice.id,
											label: choice.name,
										})),
									],
								},
							]}
						/>
					)}
				</Field>
				<Field label="Mode">
					{() => (
						<Select
							label="Mode"
							look="field"
							value={form().mode ?? ""}
							onChange={(mode) => change({ mode: mode || null })}
							groups={[
								{
									options: [
										{ value: "", label: "Agent default" },
										...(agent()?.modes ?? []).map((choice) => ({
											value: choice.id,
											label: choice.name,
										})),
									],
								},
							]}
						/>
					)}
				</Field>
				<Field label="Where it works">
					{() => (
						<Select
							label="Where it works"
							look="field"
							value={form().workspaceMode}
							onChange={(workspaceMode) => change({ workspaceMode })}
							groups={[
								{
									options: [
										{ value: "folder", label: "Project folder" },
										{ value: "worktree", label: "Fresh worktree per run" },
									],
								},
							]}
						/>
					)}
				</Field>
				<div class="flex items-center justify-between gap-3">
					<Text>Enabled</Text>
					<Switch
						label="Enabled"
						checked={form().enabled}
						onChange={(enabled) => change({ enabled })}
					/>
				</div>
				<div class="flex items-center justify-between gap-3">
					<Text>Triggers</Text>
					<Button
						size="sm"
						variant="ghost"
						disabled={form().triggers.length >= 5}
						onClick={() => change({ triggers: [...form().triggers, newTrigger("daily")] })}
					>
						Add trigger
					</Button>
				</div>
				<For each={form().triggers}>
					{(trigger, index) => (
						<div class="surface-card flex flex-col gap-3 p-3">
							<div class="flex items-center gap-2">
								<div class="min-w-0 flex-1">
									<Select
										label="Trigger"
										look="field"
										value={triggerKind(trigger)}
										onChange={(kind) => setTrigger(index(), newTrigger(kind))}
										groups={[
											{ options: KINDS.map((kind) => ({ value: kind.value, label: kind.label })) },
										]}
									/>
								</div>
								<Button
									size="sm"
									variant="ghost"
									disabled={form().triggers.length === 1}
									onClick={() =>
										change({
											triggers: form().triggers.filter((_, position) => position !== index()),
										})
									}
								>
									Remove
								</Button>
							</div>
							<Show when={trigger.kind === "schedule"}>
								<>
									<Show
										when={trigger.kind === "schedule" && trigger.cadence === "hourly"}
										fallback={
											<Field label="Time">
												{(id) => (
													<Input
														id={id}
														type="time"
														value={
															trigger.kind === "schedule" && "time" in trigger
																? trigger.time
																: "09:00"
														}
														onInput={(event) =>
															setTrigger(index(), {
																...trigger,
																time: event.currentTarget.value,
															} as Trigger)
														}
													/>
												)}
											</Field>
										}
									>
										<Field label="Minute">
											{(id) => (
												<Input
													id={id}
													type="number"
													min="0"
													max="59"
													value={
														trigger.kind === "schedule" && "minute" in trigger ? trigger.minute : 0
													}
													onInput={(event) =>
														setTrigger(index(), {
															...trigger,
															minute: Number(event.currentTarget.value),
														} as Trigger)
													}
												/>
											)}
										</Field>
									</Show>
									<Show when={trigger.kind === "schedule" && trigger.cadence === "weekly"}>
										<Field label="Day">
											{() => (
												<Select
													label="Day"
													look="field"
													value={String(
														trigger.kind === "schedule" && "day" in trigger ? trigger.day : 1,
													)}
													onChange={(day) =>
														setTrigger(index(), { ...trigger, day: Number(day) } as Trigger)
													}
													groups={[
														{
															options: DAY.map((name, number) => ({
																value: String(number),
																label: name,
															})),
														},
													]}
												/>
											)}
										</Field>
									</Show>
									<Field label="Time zone" hint="IANA zone, such as America/New_York">
										{(id) => (
											<Input
												id={id}
												value={trigger.kind === "schedule" ? trigger.timezone : ZONE}
												onInput={(event) =>
													setTrigger(index(), {
														...trigger,
														timezone: event.currentTarget.value,
													} as Trigger)
												}
											/>
										)}
									</Field>
								</>
							</Show>
						</div>
					)}
				</For>
			</div>
		</Dialog>
	);
}
