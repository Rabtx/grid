import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, Show, untrack } from "solid-js";

import {
	Alert,
	AUTOMATION_GLYPHS,
	AutomationGlyph,
	BranchIcon,
	Button,
	ClockIcon,
	CloseIcon,
	Dialog,
	Field,
	FolderIcon,
	GlyphChoices,
	IconButton,
	Input,
	ListCard,
	PlusIcon,
	PullRequestIcon,
	RadioCards,
	Row,
	Section,
	Select,
	Spinner,
	Stack,
	Switch,
	Text,
	Textarea,
} from "@/kit";
import { ModelPicker, ModePicker } from "@/modules/chat/components/pickers";
import type { ChatProvider, Role } from "@/modules/chat/types/chat.types";

import {
	DAYS,
	LOCAL_ZONE,
	newTrigger,
	TRIGGER_KINDS,
	triggerKind,
	type TriggerKind,
} from "../lib/triggers";
import type { AutomationInput, AutomationOptions, Trigger } from "../services/automations.service";

const MAX_TRIGGERS = 5;

const KIND_GROUPS = [
	{ label: "On a schedule", group: "schedule", icon: () => <ClockIcon size="sm" /> },
	{ label: "On GitHub", group: "github", icon: () => <PullRequestIcon size="sm" /> },
] as const;

const WHERE = [
	{
		value: "folder",
		label: "Project folder",
		description: "Works in the project's own checkout.",
		icon: <FolderIcon size="sm" />,
	},
	{
		value: "worktree",
		label: "Fresh worktree",
		description: "A clean worktree each run; your checkout stays untouched.",
		icon: <BranchIcon size="sm" />,
	},
] as const;

/** An agent's own defaults: the model and effort it would pick, and its mode. */
function agentDefaults(agent: ChatProvider): Pick<AutomationInput, "model" | "effort" | "mode"> {
	const model =
		agent.models.find((choice) => choice.id === agent.settings?.model) ?? agent.models[0];
	return {
		model: model?.id ?? null,
		effort: model?.defaultEffort ?? null,
		mode: agent.settings?.mode ?? agent.defaultMode ?? agent.modes[0]?.id ?? null,
	};
}

function ready(form: AutomationInput): boolean {
	return Boolean(
		form.name.trim() &&
		form.prompt.trim() &&
		form.provider &&
		form.project &&
		form.triggers.every((trigger) => trigger.kind === "event" || trigger.timezone),
	);
}

/**
 * Making or changing an automation, top to bottom in the order a person thinks about it: what it
 * is and what the agent is told, when it runs, which agent does it, and where it works. A drawer on
 * desktop, full screen on phones.
 */
export function AutomationEditor(props: {
	value: AutomationInput;
	isNew: boolean;
	projects: readonly { value: string; label: string }[];
	agents: readonly ChatProvider[];
	roles: readonly Role[];
	busy: boolean;
	error: string | null;
	onClose: () => void;
	onSave: (value: AutomationInput) => void;
}): JSX.Element {
	const [form, setForm] = createSignal<AutomationInput>(untrack(() => props.value));
	const change = (next: Partial<AutomationInput>) =>
		setForm((current) => ({ ...current, ...next }));
	const option = (next: Partial<AutomationOptions>) =>
		setForm((current) => ({ ...current, options: { ...current.options, ...next } }));
	// Off-limits are typed as one line; the list is what is between its commas.
	const [offLimits, setOffLimits] = createSignal(
		untrack(() => props.value.options.offLimits.join(", ")),
	);
	const amount = (text: string): number | null => {
		const value = Number(text);
		return text.trim() && Number.isFinite(value) && value > 0 ? value : null;
	};

	// A new automation starts on the first agent installed here, with that agent's own defaults;
	// the agents may arrive after the drawer opens.
	createEffect(
		() => props.agents[0],
		(first) => {
			if (first && !untrack(form).provider) change({ provider: first.id, ...agentDefaults(first) });
		},
	);

	const agent = () => props.agents.find((item) => item.id === form().provider);
	const model = () => agent()?.models.find((choice) => choice.id === form().model);
	const scheduled = () => form().triggers.some((trigger) => trigger.kind === "schedule");
	const zone = () =>
		form().triggers.find((trigger) => trigger.kind === "schedule")?.timezone ?? LOCAL_ZONE;
	const zones = () => [...new Set([LOCAL_ZONE, "UTC", zone()])];

	const setTrigger = (index: number, trigger: Trigger) =>
		change({
			triggers: form().triggers.map((old, position) => (position === index ? trigger : old)),
		});
	const setZone = (timezone: string) =>
		change({
			triggers: form().triggers.map((trigger) =>
				trigger.kind === "schedule" ? { ...trigger, timezone } : trigger,
			),
		});

	return (
		<Dialog
			open={true}
			kind="drawer"
			width="38rem"
			title={props.isNew ? "New automation" : "Edit automation"}
			description="An agent runs this on its own and leaves each run as a thread in the project."
			onClose={props.onClose}
			footer={
				<>
					<Button onClick={props.onClose}>Cancel</Button>
					<Button
						variant="primary"
						disabled={props.busy || !ready(form())}
						onClick={() => props.onSave(form())}
					>
						<Show when={props.busy} fallback={props.isNew ? "Create automation" : "Save changes"}>
							<Spinner /> Saving…
						</Show>
					</Button>
				</>
			}
		>
			<Stack gap={8}>
				<Show when={props.error}>{(message) => <Alert tone="danger" title={message()} />}</Show>

				<Stack gap={4}>
					<Field label="Glyph">
						{() => (
							<GlyphChoices
								label="Glyph"
								value={form().options.icon ?? AUTOMATION_GLYPHS[0].id}
								onChange={(icon) => option({ icon })}
								options={AUTOMATION_GLYPHS.map((glyph) => ({
									value: glyph.id,
									label: glyph.label,
									glyph: <AutomationGlyph icon={glyph.id} />,
								}))}
							/>
						)}
					</Field>
					<Field label="Name">
						{(id) => (
							<Input
								id={id}
								maxlength={120}
								placeholder="Review new pull requests"
								value={form().name}
								onInput={(event) => change({ name: event.currentTarget.value })}
							/>
						)}
					</Field>
					<Field label="Instructions" hint="The first message the agent gets on every run.">
						{(id) => (
							<Textarea
								id={id}
								rows={6}
								maxlength={10000}
								placeholder="What should the agent do, and what should it report back?"
								value={form().prompt}
								onInput={(event) => change({ prompt: event.currentTarget.value })}
							/>
						)}
					</Field>
				</Stack>

				<Section
					title="When it runs"
					description="Any of these starts a run. GitHub triggers need GitHub connected."
					action={
						<Button
							size="sm"
							variant="ghost"
							disabled={form().triggers.length >= MAX_TRIGGERS}
							onClick={() => change({ triggers: [...form().triggers, newTrigger("daily")] })}
						>
							<PlusIcon size="sm" /> Add
						</Button>
					}
				>
					<ListCard>
						<For each={form().triggers}>
							{(trigger, index) => (
								<TriggerRow
									trigger={trigger}
									removable={form().triggers.length > 1}
									onChange={(next) => setTrigger(index(), next)}
									onRemove={() =>
										change({
											triggers: form().triggers.filter((_, position) => position !== index()),
										})
									}
								/>
							)}
						</For>
					</ListCard>
					<Show when={scheduled()}>
						<Field label="Time zone">
							{() => (
								<Select
									label="Time zone"
									look="field"
									value={zone()}
									onChange={setZone}
									groups={[{ options: zones().map((name) => ({ value: name, label: name })) }]}
								/>
							)}
						</Field>
					</Show>
				</Section>

				<Section title="Agent" description="Who does the work, and how much it may do unasked.">
					<Show
						when={agent()}
						fallback={<Text tone="subtle">No agent is installed on this machine yet.</Text>}
					>
						{(chosen) => (
							<Row gap={1} wrap>
								<ModelPicker
									agents={props.agents}
									agent={chosen().id}
									onAgent={(id) => {
										const next = props.agents.find((item) => item.id === id);
										if (next) change({ provider: next.id, ...agentDefaults(next) });
									}}
									models={chosen().models}
									model={form().model ?? ""}
									onModel={(id) => {
										const picked = chosen().models.find((choice) => choice.id === id);
										change({ model: id, effort: picked?.defaultEffort ?? null });
									}}
									efforts={model()?.efforts ?? []}
									effort={form().effort}
									onEffort={(effort) => change({ effort })}
								/>
								<Show when={chosen().modes.length > 0}>
									<ModePicker
										modes={chosen().modes}
										mode={form().mode ?? chosen().modes[0]?.id ?? ""}
										onMode={(mode) => change({ mode })}
									/>
								</Show>
							</Row>
						)}
					</Show>
					<Show when={props.roles.length}>
						<Field label="Role" hint="Its brief goes with the instructions on every run.">
							{() => (
								<Select
									label="Role"
									look="field"
									value={form().options.role ?? ""}
									onChange={(role) => option({ role: role || null })}
									groups={[
										{
											options: [
												{ value: "", label: "No role" },
												...props.roles.map((role) => ({ value: role.id, label: role.name })),
											],
										},
									]}
								/>
							)}
						</Field>
					</Show>
				</Section>

				<Section title="Where it works">
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
					<RadioCards
						label="Where it works"
						columns={2}
						options={WHERE}
						value={form().workspaceMode}
						onChange={(workspaceMode) => change({ workspaceMode })}
					/>
					<Show when={form().workspaceMode === "worktree"}>
						<Field
							label="Start from branch"
							hint="Left empty, it starts from what the project has checked out."
						>
							{(id) => (
								<Input
									id={id}
									maxlength={200}
									placeholder="main"
									value={form().options.branch ?? ""}
									onInput={(event) => option({ branch: event.currentTarget.value.trim() || null })}
								/>
							)}
						</Field>
					</Show>
				</Section>

				<Section title="When it is done">
					<Row gap={3} justify="between">
						<Stack gap={0.5}>
							<Text weight="medium">Open a pull request</Text>
							<Text tone="subtle">Commits its change, pushes it and opens a pull request.</Text>
						</Stack>
						<Switch
							label="Open a pull request"
							checked={form().options.pullRequest}
							onChange={(pullRequest) =>
								option({ pullRequest, waitForReview: pullRequest && form().options.waitForReview })
							}
						/>
					</Row>
					<Row gap={3} justify="between">
						<Stack gap={0.5}>
							<Text weight="medium">Wait for my review</Text>
							<Text tone="subtle">Stops at the pull request; nothing is merged without you.</Text>
						</Stack>
						<Switch
							label="Wait for my review"
							checked={form().options.waitForReview}
							disabled={!form().options.pullRequest}
							onChange={(waitForReview) => option({ waitForReview })}
						/>
					</Row>
				</Section>

				<Section
					title="Guardrails"
					description="A run that goes past one of these stops and fails."
				>
					<Row gap={2} wrap>
						<div class="min-w-0 flex-1">
							<Field label="Time limit (min)">
								{(id) => (
									<Input
										id={id}
										type="number"
										min={1}
										max={1440}
										placeholder="No limit"
										value={form().options.minutes ?? ""}
										onInput={(event) => option({ minutes: amount(event.currentTarget.value) })}
									/>
								)}
							</Field>
						</div>
						<div class="min-w-0 flex-1">
							<Field label="Budget per run ($)">
								{(id) => (
									<Input
										id={id}
										type="number"
										min={0.01}
										step={0.5}
										placeholder="No budget"
										value={form().options.budgetUsd ?? ""}
										onInput={(event) => option({ budgetUsd: amount(event.currentTarget.value) })}
									/>
								)}
							</Field>
						</div>
					</Row>
					<Field label="Off-limits" hint="Paths it must not change, separated by commas.">
						{(id) => (
							<Input
								id={id}
								placeholder="migrations/, .env"
								value={offLimits()}
								onInput={(event) => {
									setOffLimits(event.currentTarget.value);
									option({
										offLimits: event.currentTarget.value
											.split(",")
											.map((path) => path.trim())
											.filter(Boolean)
											.slice(0, 20),
									});
								}}
							/>
						)}
					</Field>
				</Section>

				<Row gap={3} justify="between">
					<Stack gap={0.5}>
						<Text weight="medium">Active</Text>
						<Text tone="subtle">Runs on its triggers as soon as it is saved.</Text>
					</Stack>
					<Switch
						label="Active"
						checked={form().enabled}
						onChange={(enabled) => change({ enabled })}
					/>
				</Row>
			</Stack>
		</Dialog>
	);
}

/** One trigger: its kind, then the time (and day, or minute) a schedule needs. */
function TriggerRow(props: {
	trigger: Trigger;
	removable: boolean;
	onChange: (trigger: Trigger) => void;
	onRemove: () => void;
}): JSX.Element {
	const kind = () => triggerKind(props.trigger);
	const hint = () => TRIGGER_KINDS.find((item) => item.value === kind())?.hint;
	const time = () =>
		props.trigger.kind === "schedule" && "time" in props.trigger ? props.trigger.time : "09:00";
	const day = () =>
		props.trigger.kind === "schedule" && "day" in props.trigger ? (props.trigger.day ?? 1) : 1;
	const minute = () =>
		props.trigger.kind === "schedule" && "minute" in props.trigger ? props.trigger.minute : 0;
	const minutes = () => {
		const every = Array.from({ length: 12 }, (_, step) => step * 5);
		return every.includes(minute()) ? every : [...every, minute()].sort((a, b) => a - b);
	};
	// Only the field a schedule has changes; the kind and zone stay as they are.
	const patch = (next: { time?: string; day?: number; minute?: number }) =>
		props.onChange({ ...props.trigger, ...next } as Trigger);

	return (
		<Stack gap={2} class="p-3">
			<Row gap={2}>
				<div class="min-w-0 flex-1">
					<Select<TriggerKind>
						label="Trigger"
						look="field"
						value={kind()}
						onChange={(next) => props.onChange(newTrigger(next, props.trigger))}
						groups={KIND_GROUPS.map((group) => ({
							label: group.label,
							options: TRIGGER_KINDS.filter((item) => item.group === group.group).map((item) => ({
								value: item.value,
								label: item.label,
								description: item.hint,
								icon: group.icon(),
							})),
						}))}
					/>
				</div>
				<Show when={props.removable}>
					<IconButton label="Remove trigger" size="sm" onClick={props.onRemove}>
						<CloseIcon size="sm" />
					</IconButton>
				</Show>
			</Row>
			<Show
				when={props.trigger.kind === "schedule"}
				fallback={
					<Text size="caption" tone="subtle">
						{hint()}
					</Text>
				}
			>
				<Row gap={2} wrap>
					<Show when={kind() === "weekly"}>
						<div class="min-w-0 flex-1">
							<Select
								label="Day"
								look="field"
								value={String(day())}
								onChange={(next) => patch({ day: Number(next) })}
								groups={[
									{ options: DAYS.map((name, number) => ({ value: String(number), label: name })) },
								]}
							/>
						</div>
					</Show>
					<Show
						when={kind() === "hourly"}
						fallback={
							<Input
								type="time"
								aria-label="Time"
								value={time()}
								onInput={(event) => patch({ time: event.currentTarget.value })}
							/>
						}
					>
						<div class="min-w-0 flex-1">
							<Select
								label="Minute past the hour"
								look="field"
								value={String(minute())}
								onChange={(next) => patch({ minute: Number(next) })}
								groups={[
									{
										options: minutes().map((value) => ({
											value: String(value),
											label: `:${String(value).padStart(2, "0")} past the hour`,
										})),
									},
								]}
							/>
						</div>
					</Show>
				</Row>
			</Show>
		</Stack>
	);
}
