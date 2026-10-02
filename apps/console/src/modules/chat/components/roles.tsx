import SlidersHorizontalIcon from "@hugeicons/core-free-icons/SlidersHorizontalIcon";
import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, Show, untrack } from "solid-js";

import {
	AgentLogo,
	Button,
	ChevronDownIcon,
	Dialog,
	EffortSlider,
	Field,
	Icon,
	IconButton,
	NoRoleMark,
	NoRoleRow,
	PANEL_ACTION,
	Input,
	PlusIcon,
	Popover,
	type PopoverControl,
	ROLE_CHIP,
	ROLE_CHIP_ICON,
	RoleIconChoices,
	RoleMark,
	Select,
	SettingsIcon,
	TeamRow,
	Text,
	Textarea,
} from "@/kit";

import { shortModelName } from "../lib/choices";
import type { ChatProvider, Choice, Role, RoleDraft } from "../types/chat.types";

/** What a role runs, in words: the agent, the model it resolves to, and its effort. */
export function describeRole(
	role: Role,
	providers: readonly ChatProvider[],
): { agent: string; model: string | null; effort: string | null } {
	const provider = providers.find((item) => item.id === role.provider);
	const models = provider?.models ?? [];
	const model =
		models.find((item) => item.id === role.model) ??
		models.find((item) => item.id === provider?.settings?.model) ??
		models[0];
	const effort = model?.efforts?.find((level) => level.id === role.effort);
	return {
		agent: provider?.name ?? role.provider,
		model: model ? shortModelName(model.name) : null,
		effort: effort?.name ?? null,
	};
}

/** The line under a role's name: the agent's logo, then agent · model · effort. */
function RoleLine(props: { role: Role; providers: readonly ChatProvider[] }): JSX.Element {
	const about = () => describeRole(props.role, props.providers);
	return (
		<>
			<AgentLogo id={props.role.provider} name={about().agent} class="size-3.5" />
			<span class="truncate">
				{[about().agent, about().model, about().effort].filter(Boolean).join(" · ")}
			</span>
		</>
	);
}

/**
 * The role chip and its menu (Figma 11 · Agent roles, Role menu): "Your team", each role with
 * what it runs, the chosen one checked; working without a role; and new and edit along the
 * bottom. A panel above the composer on desktop, a sheet on phones.
 */
export function RoleMenu(props: {
	roles: readonly Role[];
	providers: readonly ChatProvider[];
	/** Whether a role's agent is offered here; one that is not cannot be picked. */
	usable: (role: Role) => boolean;
	value: string | null;
	onPick: (id: string | null) => void;
	onNew: () => void;
	onEdit: (role: Role) => void;
	control?: (control: PopoverControl) => void;
}): JSX.Element {
	const current = () => props.roles.find((role) => role.id === props.value) ?? null;
	return (
		<Popover
			label="Role"
			title="Your team"
			placement="top-start"
			width="md:w-84"
			control={props.control}
			triggerClass={ROLE_CHIP}
			trigger={
				<>
					<Show when={current()} fallback={<NoRoleMark size="sm" />}>
						{(role) => <RoleMark icon={role().icon} size="sm" />}
					</Show>
					<span class="truncate">{current()?.name ?? "No role"}</span>
					<ChevronDownIcon size="xs" class="shrink-0 text-fg-faint" />
				</>
			}
		>
			{(close) => (
				<div class="flex flex-col pb-2 md:py-1.5">
					<p class="hidden px-3.5 pt-1 pb-1.5 text-caption text-fg-subtle md:block">Your team</p>
					{/* oxlint-disable-next-line jsx-a11y/interactive-supports-focus -- focus sits on its radios */}
					<div
						role="radiogroup"
						aria-label="Your team"
						onKeyDown={(event) => {
							// Arrows move between the roles; Enter or Space picks one.
							if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
							const rows = [
								...event.currentTarget.querySelectorAll<HTMLButtonElement>(
									'[role="radio"]:not(:disabled)',
								),
							];
							const at = rows.indexOf(document.activeElement as HTMLButtonElement);
							event.preventDefault();
							rows[
								(at + (event.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length
							]?.focus();
						}}
						class="flex flex-col gap-0.5 px-3 md:px-1.5"
					>
						<For each={props.roles}>
							{(role) => (
								<TeamRow
									icon={role.icon}
									name={role.name}
									detail={
										props.usable(role) ? (
											<RoleLine role={role} providers={props.providers} />
										) : (
											<span class="truncate">
												{describeRole(role, props.providers).agent} is not on this machine
											</span>
										)
									}
									disabled={!props.usable(role)}
									selected={role.id === props.value}
									onPick={() => {
										props.onPick(role.id);
										close();
									}}
								/>
							)}
						</For>
						<Show when={props.roles.length === 0}>
							<Text size="caption" tone="subtle" class="px-2 py-3">
								No roles yet. A role is an agent, model and effort with a brief: make one for each
								kind of work, and pick it here.
							</Text>
						</Show>
						<Show when={props.value}>
							<NoRoleRow
								label="No role"
								onPick={() => {
									props.onPick(null);
									close();
								}}
							/>
						</Show>
					</div>
					<div class="mx-3 mt-1.5 h-px bg-line md:mx-0" />
					{/* Phones: two buttons side by side; desktop: a quiet row. */}
					<div class="flex gap-2 px-3 pt-3 md:items-center md:justify-between md:px-1.5 md:pt-1.5">
						<Show when={current()}>
							{(role) => (
								<Button
									variant="secondary"
									size="xl"
									class={`${PANEL_ACTION.quiet} md:order-last`}
									onClick={() => {
										close();
										props.onEdit(role());
									}}
								>
									Edit {role().name}
								</Button>
							)}
						</Show>
						<Button
							variant="primary"
							size="xl"
							icon={<PlusIcon />}
							class={PANEL_ACTION.add}
							onClick={() => {
								close();
								props.onNew();
							}}
						>
							New role
						</Button>
					</div>
				</div>
			)}
		</Popover>
	);
}

/** The agents a role can run, as a select's options. */
function agentOptions(providers: readonly ChatProvider[]) {
	return providers.map((provider) => ({
		value: provider.id,
		label: provider.name,
		icon: <AgentLogo id={provider.id} name={provider.name} />,
	}));
}

/** An agent's models, as a select's options. */
function modelOptions(models: readonly Choice[]) {
	return models.map((model) => ({ value: model.id, label: shortModelName(model.name) }));
}

/**
 * The chosen role's settings (Figma 11 · Agent roles, Role settings): its agent, model and effort
 * for this thread. "Use once" keeps them for this thread only; "Save to role" makes them the
 * role's. The gear edits the role itself.
 */
export function RoleSettings(props: {
	role: Role;
	agents: readonly ChatProvider[];
	agent: string;
	onAgent: (id: string) => void;
	models: readonly Choice[];
	model: string | null;
	onModel: (id: string) => void;
	efforts: readonly Choice[];
	effort: string | null;
	onEffort: (id: string) => void;
	/** The thread's choices differ from the role's. */
	changed: boolean;
	onSave: () => Promise<void>;
	onEdit: () => void;
	/** Hands over a way to open it from code: the composer's `/model` while a role is chosen. */
	control?: (control: PopoverControl) => void;
}): JSX.Element {
	const [saving, setSaving] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);
	return (
		<Popover
			label={`${props.role.name} settings`}
			title={props.role.name}
			placement="top-start"
			width="md:w-96"
			control={props.control}
			triggerClass={ROLE_CHIP_ICON}
			trigger={<Icon icon={SlidersHorizontalIcon} size="sm" />}
		>
			{(close) => (
				<div class="flex flex-col gap-4 px-4 pb-4 md:p-3">
					<div class="flex items-center gap-3">
						<span class="hidden md:block">
							<RoleMark icon={props.role.icon} />
						</span>
						<div class="flex min-w-0 flex-1 flex-col">
							<span class="hidden truncate font-medium text-body-lg text-fg md:block">
								{props.role.name}
							</span>
							<Text size="caption" tone="subtle" class="line-clamp-2">
								{props.role.brief || "No brief yet."}
							</Text>
						</div>
						<IconButton
							label={`Edit ${props.role.name}`}
							size="sm"
							shape="round"
							onClick={() => {
								close();
								props.onEdit();
							}}
						>
							<SettingsIcon />
						</IconButton>
					</div>
					<Field label="Agent">
						{() => (
							<Select
								label="Agent"
								value={props.agent}
								onChange={props.onAgent}
								groups={[{ options: agentOptions(props.agents) }]}
							/>
						)}
					</Field>
					<Show when={props.models.length > 0}>
						<Field label="Model">
							{() => (
								<Select
									label="Model"
									value={props.model ?? ""}
									onChange={props.onModel}
									groups={[{ options: modelOptions(props.models) }]}
								/>
							)}
						</Field>
					</Show>
					<Show when={props.efforts.length > 0}>
						<EffortSlider
							label="Reasoning effort"
							levels={props.efforts}
							value={props.effort}
							onChange={props.onEffort}
						/>
					</Show>
					<Show when={error()}>
						{(message) => (
							<Text size="caption" tone="danger">
								{message()}
							</Text>
						)}
					</Show>
					<div class="flex items-center gap-2 border-line border-t pt-3">
						<Text size="caption" tone="subtle" class="hidden flex-1 md:block">
							{props.changed ? "Only this thread" : "As the role is set"}
						</Text>
						<Button
							variant="secondary"
							size="xl"
							class={PANEL_ACTION.quiet}
							onClick={() => close()}
						>
							Use once
						</Button>
						<Button
							variant="primary"
							size="xl"
							class={PANEL_ACTION.main}
							disabled={!props.changed || saving()}
							onClick={async () => {
								setSaving(true);
								setError(null);
								try {
									await props.onSave();
									close();
								} catch (cause) {
									setError(cause instanceof Error ? cause.message : "Could not save the role");
								} finally {
									setSaving(false);
								}
							}}
						>
							{saving() ? "Saving…" : "Save to role"}
						</Button>
					</div>
				</div>
			)}
		</Popover>
	);
}

/**
 * Make a role, or change one (Figma 11 · Agent roles, New role): its glyph and name, what it
 * does, and the agent, model and effort it runs. A sheet on phones, a card on desktop.
 */
export function RoleDialog(props: {
	open: boolean;
	/** The role to change; none makes a new one. */
	target: Role | null;
	agents: readonly ChatProvider[];
	onClose: () => void;
	onSave: (draft: RoleDraft) => Promise<void>;
	onDelete?: () => Promise<void>;
}): JSX.Element {
	const [name, setName] = createSignal("");
	const [icon, setIcon] = createSignal("code");
	const [brief, setBrief] = createSignal("");
	const [agent, setAgent] = createSignal("");
	const [model, setModel] = createSignal<string | null>(null);
	const [effort, setEffort] = createSignal<string | null>(null);
	const [busy, setBusy] = createSignal(false);
	const [confirming, setConfirming] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);

	// Each opening starts from the role (or a blank one on the first agent).
	createEffect(
		() => props.open,
		(open) => {
			if (!open) return;
			const role = untrack(() => props.target);
			const first = untrack(() => props.agents[0]?.id ?? "");
			setName(role?.name ?? "");
			setIcon(role?.icon ?? "code");
			setBrief(role?.brief ?? "");
			setAgent(role?.provider ?? first);
			setModel(role?.model ?? null);
			setEffort(role?.effort ?? null);
			setConfirming(false);
			setError(null);
		},
	);

	const provider = () => props.agents.find((item) => item.id === agent()) ?? null;
	const models = () => provider()?.models ?? [];
	const chosenModel = () =>
		models().find((item) => item.id === model()) ??
		models().find((item) => item.id === provider()?.settings?.model) ??
		models()[0];
	const efforts = () => chosenModel()?.efforts ?? [];
	const chosenEffort = () =>
		efforts().find((level) => level.id === effort())?.id ?? chosenModel()?.defaultEffort ?? null;

	async function save(): Promise<void> {
		if (!name().trim()) {
			setError("Give the role a name");
			return;
		}
		setBusy(true);
		setError(null);
		try {
			await props.onSave({
				name: name().trim(),
				icon: icon(),
				brief: brief().trim(),
				provider: agent(),
				// What was picked; unpicked stays the agent's default.
				model: model(),
				effort: effort(),
				mode: props.target?.mode ?? null,
			});
			props.onClose();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not save the role");
		} finally {
			setBusy(false);
		}
	}

	return (
		<Dialog
			open={props.open}
			onClose={props.onClose}
			title={props.target ? `Edit ${props.target.name}` : "New role"}
			width="28rem"
		>
			<form
				class="flex flex-col gap-4"
				onSubmit={(event) => {
					event.preventDefault();
					void save();
				}}
			>
				<Field label="Name">
					{(id) => (
						<Input
							id={id}
							value={name()}
							maxlength={40}
							placeholder="Design engineer"
							onInput={(event) => setName(event.currentTarget.value)}
						/>
					)}
				</Field>
				<RoleIconChoices label="Icon" value={icon()} onChange={setIcon} />
				<Field
					label="What this role does"
					hint="The agent is given this when a thread starts as the role."
				>
					{(id) => (
						<Textarea
							id={id}
							rows={3}
							maxlength={2000}
							value={brief()}
							placeholder="Ships UI with the design tokens. Prefers small PRs with screenshots."
							onInput={(event) => setBrief(event.currentTarget.value)}
						/>
					)}
				</Field>
				<Field label="Agent">
					{() => (
						<Select
							label="Agent"
							value={agent()}
							onChange={(id) => {
								setAgent(id);
								setModel(null);
								setEffort(null);
							}}
							groups={[{ options: agentOptions(props.agents) }]}
						/>
					)}
				</Field>
				<Show when={models().length > 0}>
					<Field label="Model">
						{() => (
							<Select
								label="Model"
								value={chosenModel()?.id ?? ""}
								onChange={(id) => {
									setModel(id);
									setEffort(null);
								}}
								groups={[{ options: modelOptions(models()) }]}
							/>
						)}
					</Field>
				</Show>
				<Show when={efforts().length > 0}>
					<EffortSlider
						label="Reasoning effort"
						levels={efforts()}
						value={chosenEffort()}
						onChange={setEffort}
					/>
				</Show>
				<Show when={error()}>
					{(message) => (
						<Text size="caption" tone="danger">
							{message()}
						</Text>
					)}
				</Show>
				<div class="flex flex-col-reverse gap-2 md:flex-row md:items-center">
					<Show when={props.target && props.onDelete}>
						<Button
							variant="danger"
							size="xl"
							disabled={busy()}
							onClick={async () => {
								if (!confirming()) {
									setConfirming(true);
									return;
								}
								setBusy(true);
								try {
									await props.onDelete?.();
									props.onClose();
								} catch (cause) {
									setError(cause instanceof Error ? cause.message : "Could not delete the role");
								} finally {
									setBusy(false);
								}
							}}
						>
							{confirming() ? "Delete — sure?" : "Delete role"}
						</Button>
					</Show>
					<span class="hidden flex-1 md:block" />
					<Button type="submit" variant="primary" size="xl" disabled={busy() || !agent()}>
						{busy() ? "Saving…" : props.target ? "Save role" : "Create role"}
					</Button>
				</div>
			</form>
		</Dialog>
	);
}
