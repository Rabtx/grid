import SlidersHorizontalIcon from "@hugeicons/core-free-icons/SlidersHorizontalIcon";
import type { JSX } from "@solidjs/web";
import { createSignal, For, Show } from "solid-js";

import {
	AgentLogo,
	Button,
	ChevronDownIcon,
	EffortSlider,
	Field,
	Icon,
	IconButton,
	NoRoleMark,
	NoRoleRow,
	PANEL_ACTION,
	PlusIcon,
	Popover,
	type PopoverControl,
	ROLE_CHIP,
	ROLE_CHIP_ICON,
	RoleMark,
	Select,
	SettingsIcon,
	TeamRow,
	Text,
} from "@/kit";

import { shortModelName } from "../lib/choices";
import type { ChatProvider, Choice, Role } from "../types/chat.types";

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
			label="Teammate"
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
					<span class="truncate">{current()?.name ?? "No teammate"}</span>
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
								No teammates yet. A teammate is a specialist any agent can be: its brief, skills and
								tools go with the thread. Add one for each kind of work, and pick it here.
							</Text>
						</Show>
						<Show when={props.value}>
							<NoRoleRow
								label="No teammate"
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
							New teammate
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
							{props.changed ? "Only this thread" : "As the teammate is set"}
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
									setError(cause instanceof Error ? cause.message : "Could not save the teammate");
								} finally {
									setSaving(false);
								}
							}}
						>
							{saving() ? "Saving…" : "Save to teammate"}
						</Button>
					</div>
				</div>
			)}
		</Popover>
	);
}
