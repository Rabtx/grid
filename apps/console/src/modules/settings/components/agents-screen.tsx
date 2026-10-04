import { useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, Show } from "solid-js";

import {
	AgentLogo,
	Alert,
	Badge,
	Button,
	Dialog,
	EditIcon,
	ExternalIcon,
	Field,
	FileIcon,
	GlobeIcon,
	iconButton,
	Input,
	ListIcon,
	MoreIcon,
	notify,
	PlusIcon,
	PullRequestIcon,
	Segmented,
	SettingsGroup,
	SettingsRow,
	Skeleton,
	Spinner,
	Stack,
	Switch,
	TerminalIcon,
	Text,
} from "@/kit";
import { useAuth } from "@/modules/auth";
import { ModelPicker, ModePicker } from "@/modules/chat/components/pickers";
import { chatService } from "@/modules/chat/services/chat.service";
import { providersStore } from "@/modules/chat/stores/providers";
import type { ChatProvider, ProviderSettings } from "@/modules/chat/types/chat.types";
import { environmentsStore, MachinePicker, scopeFor } from "@/modules/environments";
import { machineService } from "@/modules/environments/services/machine.service";
import { useShell } from "@/modules/shell";
import { useWorkspaces } from "@/modules/workspaces";
import { workspacesService } from "@/modules/workspaces/services/workspaces.service";
import type {
	AgentCapability,
	AgentPolicy,
	AgentRule,
} from "@/modules/workspaces/types/workspace.types";

import { SettingsPage, settingsMenu } from "./settings-page";

/** What agents can do on their own, in the order the Figma lists them. */
const CAPABILITIES: { id: AgentCapability; label: string; icon: () => JSX.Element }[] = [
	{ id: "read", label: "Read files in the project", icon: () => <FileIcon /> },
	{ id: "edit", label: "Edit files in the project", icon: () => <EditIcon /> },
	{ id: "commands", label: "Run commands", icon: () => <TerminalIcon /> },
	{ id: "packages", label: "Install packages", icon: () => <ListIcon /> },
	{ id: "network", label: "Use the network", icon: () => <GlobeIcon /> },
	{ id: "push", label: "Push to GitHub", icon: () => <PullRequestIcon /> },
];

/** What agents do until the workspace says otherwise: reading goes ahead, the rest asks. */
const DEFAULT_RULES: Record<AgentCapability, AgentRule> = {
	read: "allow",
	edit: "ask",
	commands: "ask",
	packages: "ask",
	network: "ask",
	push: "ask",
};

const RULES = [
	{ value: "allow", label: "Allow" },
	{ value: "ask", label: "Ask" },
	{ value: "never", label: "Never" },
] as const;

function reason(cause: unknown, fallback: string): string {
	return cause instanceof Error ? cause.message : fallback;
}

/**
 * Settings → Agents & permissions (Figma 24): which coding agents work here and what they may do
 * without asking. Each agent's row says its version, default model and whether it is connected;
 * its ⋯ opens what new threads start with, signing in and refreshing models. Below, the workspace
 * decides per kind of action whether agents go ahead, ask, or never — the runner answers their
 * permission requests by it — and two safety switches.
 */
export function AgentsScreen(): JSX.Element {
	const auth = useAuth();
	const shell = useShell();
	const workspaces = useWorkspaces();
	// Each machine has its own agents; this one unless an environment is picked.
	const [machine, setMachine] = createSignal<string | null>(null);
	const [open, setOpen] = createSignal<ChatProvider | null>(null);
	const [adding, setAdding] = createSignal(false);
	const scope = () => scopeFor(machine());
	const admin = () => workspaces.current()?.role !== "member";
	const policy = (): AgentPolicy => workspaces.current()?.settings?.agentPolicy ?? {};
	const ruleOf = (id: AgentCapability): AgentRule => policy().rules?.[id] ?? DEFAULT_RULES[id];
	const defaultAgent = () => workspaces.current()?.settings?.defaultAgent;

	// Read afresh on every visit: coming back from an install or sign-in shows where it stands.
	createEffect(
		() => [auth.token(), scope()] as const,
		([token, where]) => {
			if (token) void providersStore.reload(token, where);
		},
	);
	const machineLabel = () =>
		machine() ? (environmentsStore.labelOf(machine()) ?? "that machine") : "this machine";
	const providers = () => providersStore.providers(scope());
	const current = () => {
		const chosen = open();
		return chosen ? (providers().find((provider) => provider.id === chosen.id) ?? chosen) : null;
	};

	async function savePolicy(change: AgentPolicy): Promise<void> {
		const token = auth.token(),
			ws = workspaces.current()?.slug;
		if (!token || !ws) return;
		try {
			await workspacesService.update(token, ws, { settings: { agentPolicy: change } });
			workspaces.refresh();
		} catch (cause) {
			notify({ title: "Not saved", description: reason(cause, "Try again") });
		}
	}

	const status = (provider: ChatProvider): JSX.Element => {
		const signedIn = provider.setup?.signedIn;
		return (
			<Show
				when={signedIn !== false || provider.setup?.signInOptional}
				fallback={<Badge tone="warning">Sign in needed</Badge>}
			>
				<Badge tone="success" dot>
					Connected
				</Badge>
			</Show>
		);
	};
	const line = (provider: ChatProvider) => {
		if (!provider.available) return `Not installed on ${machineLabel()}`;
		const model = provider.models.find(
			(item) => item.id === (provider.settings?.model ?? provider.models[0]?.id),
		);
		const parts = [
			shell.desktop() ? provider.version : null,
			model ? (shell.desktop() ? `default model ${model.name}` : model.name) : null,
			provider.settings?.enabled === false ? "hidden from new threads" : null,
		].filter(Boolean);
		return parts.join(" · ") || "Installed";
	};

	return (
		<SettingsPage
			title="Agents & permissions"
			description={`Choose which coding agents work in ${workspaces.current()?.name ?? "this workspace"}, and what they can do without asking you first.`}
			subtitle={shell.desktop() ? undefined : "Saved automatically"}
			menu={
				admin()
					? settingsMenu("Agents", [{ items: [{ id: "add", label: "Add ACP agent" }] }], () =>
							setAdding(true),
						)
					: undefined
			}
		>
			<Show when={providersStore.error(scope())}>
				{(message) => <Alert tone="danger" title={message()} />}
			</Show>

			<SettingsGroup
				title="Agents"
				description={`Running on ${machineLabel()}`}
				action={
					<div class="flex items-center gap-2 max-md:hidden">
						<Show when={environmentsStore.environments().length > 0}>
							<div class="md:w-48">
								<MachinePicker value={machine()} onChange={setMachine} />
							</div>
						</Show>
						<Show when={admin() && machine() === null}>
							<Button size="sm" icon={<PlusIcon size="sm" />} onClick={() => setAdding(true)}>
								Add ACP agent
							</Button>
						</Show>
					</div>
				}
			>
				<Show
					when={providers().length > 0}
					fallback={
						<div class="p-3">
							<Stack gap={2}>
								<Skeleton class="h-10" />
								<Skeleton class="h-10" />
							</Stack>
						</div>
					}
				>
					<For each={providers()}>
						{(provider) => (
							<SettingsRow
								inline
								mark={<AgentLogo id={provider.id} name={provider.name} />}
								label={provider.name}
								description={line(provider)}
							>
								<Show
									when={provider.available}
									fallback={<InstallButton provider={provider} scope={scope()} />}
								>
									<Show when={defaultAgent() === provider.id && shell.desktop()}>
										<Badge tone="accent">Default</Badge>
									</Show>
									{status(provider)}
									<button
										type="button"
										aria-label={`${provider.name} settings`}
										class={iconButton({ size: "sm" })}
										onClick={() => setOpen(provider)}
									>
										<MoreIcon />
									</button>
								</Show>
							</SettingsRow>
						)}
					</For>
				</Show>
			</SettingsGroup>

			<SettingsGroup
				title={shell.desktop() ? "What agents can do on their own" : "Without asking you"}
				description="Applies to every agent when it asks first. You can tighten it per role."
			>
				<For each={CAPABILITIES}>
					{(capability) => (
						<SettingsRow leading={capability.icon()} label={capability.label}>
							<Segmented<AgentRule>
								label={capability.label}
								size="sm"
								block={!shell.desktop()}
								value={ruleOf(capability.id)}
								onChange={(rule) => {
									if (admin()) void savePolicy({ rules: { [capability.id]: rule } });
								}}
								options={RULES}
							/>
						</SettingsRow>
					)}
				</For>
			</SettingsGroup>

			<SettingsGroup title="Safety">
				<SettingsRow
					inline
					label="Work on a new branch"
					description={`Agents never commit straight to ${workspaces.current()?.settings?.defaultBranch ?? "main"}`}
				>
					<Switch
						label="Work on a new branch"
						checked={policy().newBranch ?? false}
						disabled={!admin()}
						onChange={(newBranch) => void savePolicy({ newBranch })}
					/>
				</SettingsRow>
				<SettingsRow
					inline
					label="Show me every command before it runs"
					description="Overrides “Allow” for Run commands"
				>
					<Switch
						label="Show me every command before it runs"
						checked={policy().showCommands ?? false}
						disabled={!admin()}
						onChange={(showCommands) => void savePolicy({ showCommands })}
					/>
				</SettingsRow>
			</SettingsGroup>

			<Show when={current()}>
				{(provider) => (
					<AgentSheet
						provider={provider()}
						scope={scope()}
						machineLabel={machineLabel()}
						admin={admin()}
						isDefault={defaultAgent() === provider().id}
						onClose={() => setOpen(null)}
					/>
				)}
			</Show>
			<AddAgentDialog open={adding()} onClose={() => setAdding(false)} />
		</SettingsPage>
	);
}

/** Install an agent that is missing: its official installer in a terminal, or how to. */
function InstallButton(props: { provider: ChatProvider; scope: string }): JSX.Element {
	const auth = useAuth();
	const navigate = useNavigate();
	const [busy, setBusy] = createSignal(false);
	async function install(): Promise<void> {
		const token = auth.token();
		if (!token || busy()) return;
		setBusy(true);
		try {
			const terminal = await chatService.setupProvider(
				token,
				props.provider.id,
				"install",
				props.scope,
			);
			navigate(`/terminal/${terminal.id}`);
		} catch (cause) {
			notify({ title: "Could not install", description: reason(cause, "Try again") });
		} finally {
			setBusy(false);
		}
	}
	return (
		<Show
			when={props.provider.setup?.canInstall}
			fallback={
				<Show when={props.provider.setup?.docs}>
					{(docs) => (
						<a
							href={docs()}
							target="_blank"
							rel="noopener noreferrer"
							class={iconButton({ size: "sm" })}
							aria-label={`How to install ${props.provider.name}`}
						>
							<ExternalIcon />
						</a>
					)}
				</Show>
			}
		>
			<Button
				size="sm"
				icon={<ExternalIcon size="sm" />}
				disabled={busy()}
				onClick={() => void install()}
			>
				Install
			</Button>
		</Show>
	);
}

/**
 * One agent's settings: whether new threads offer it, the model, effort and mode they start with,
 * signing in, refreshing its models, making it the workspace's default and removing one added here.
 */
function AgentSheet(props: {
	provider: ChatProvider;
	scope: string;
	machineLabel: string;
	admin: boolean;
	isDefault: boolean;
	onClose: () => void;
}): JSX.Element {
	const auth = useAuth();
	const navigate = useNavigate();
	const workspaces = useWorkspaces();
	const [busy, setBusy] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);
	const settings = (): ProviderSettings => props.provider.settings ?? {};
	const enabled = () => settings().enabled !== false;
	const model = () => settings().model ?? props.provider.models[0]?.id ?? "";
	const currentModel = () => props.provider.models.find((item) => item.id === model());

	async function run(
		action: (token: string) => Promise<unknown>,
		failure: string,
	): Promise<boolean> {
		const token = auth.token();
		if (!token || busy()) return false;
		setBusy(true);
		setError(null);
		try {
			await action(token);
			return true;
		} catch (cause) {
			setError(reason(cause, failure));
			return false;
		} finally {
			setBusy(false);
		}
	}
	const save = (change: ProviderSettings) =>
		run(
			(token) =>
				providersStore.saveSettings(
					token,
					props.provider.id,
					{ ...settings(), ...change },
					props.scope,
				),
			"Could not save",
		);
	async function signIn(): Promise<void> {
		const token = auth.token();
		if (!token) return;
		try {
			const terminal = await chatService.setupProvider(
				token,
				props.provider.id,
				"sign-in",
				props.scope,
			);
			navigate(`/terminal/${terminal.id}`);
		} catch (cause) {
			setError(reason(cause, "Could not open a terminal for that"));
		}
	}
	async function makeDefault(): Promise<void> {
		const ws = workspaces.current()?.slug;
		if (!ws) return;
		if (
			await run(
				(token) =>
					workspacesService.update(token, ws, { settings: { defaultAgent: props.provider.id } }),
				"Could not make it the default",
			)
		) {
			workspaces.refresh();
			notify({ title: `${props.provider.name} is the default agent` });
		}
	}
	async function remove(): Promise<void> {
		if (
			await run(
				(token) => machineService.removeAgent(token, props.provider.id),
				"Could not remove it",
			)
		) {
			const token = auth.token();
			if (token) void providersStore.reload(token, props.scope);
			notify({ title: `${props.provider.name} was removed` });
			props.onClose();
		}
	}

	return (
		<Dialog
			open={true}
			onClose={props.onClose}
			title={props.provider.name}
			description={[props.provider.version, `on ${props.machineLabel}`].filter(Boolean).join(" · ")}
		>
			<Stack gap={4}>
				<Show when={error()}>{(message) => <Alert tone="danger" title={message()} />}</Show>
				<div class="divide-y divide-line">
					<SettingsRow inline label="Offer in new threads">
						<Switch
							label={`Offer ${props.provider.name} in new threads`}
							checked={enabled()}
							onChange={(on) => void save({ enabled: on })}
						/>
					</SettingsRow>
					<Show when={enabled() && props.provider.models.length > 0}>
						<SettingsRow label="New threads start with">
							<ModelPicker
								models={props.provider.models}
								model={model()}
								onModel={(id) => {
									const levels =
										props.provider.models.find((item) => item.id === id)?.efforts ?? [];
									const effort = levels.some((level) => level.id === settings().effort)
										? settings().effort
										: undefined;
									void save({ model: id, effort });
								}}
								efforts={currentModel()?.efforts ?? []}
								effort={settings().effort ?? currentModel()?.defaultEffort ?? null}
								onEffort={(id) => void save({ effort: id })}
							/>
							<Show when={props.provider.modes.length > 0}>
								<ModePicker
									modes={props.provider.modes}
									mode={settings().mode ?? props.provider.defaultMode ?? props.provider.modes[0].id}
									onMode={(id) => void save({ mode: id })}
								/>
							</Show>
						</SettingsRow>
					</Show>
					<Show when={props.provider.setup?.canSignIn}>
						<SettingsRow
							inline
							label={props.provider.setup?.signedIn ? "Signed in" : "Not signed in"}
							description="Uses your own account with the agent's vendor"
						>
							<Button size="sm" onClick={() => void signIn()}>
								{props.provider.setup?.signedIn ? "Sign in again" : "Sign in"}
							</Button>
						</SettingsRow>
					</Show>
					<SettingsRow inline label="Models" description={`${props.provider.models.length} known`}>
						<Button
							size="sm"
							disabled={busy()}
							onClick={() =>
								void run(
									(token) => providersStore.refresh(token, props.provider.id, props.scope),
									"Could not refresh the models",
								)
							}
						>
							<Show when={busy()} fallback="Refresh">
								<Spinner label="Refreshing" />
							</Show>
						</Button>
					</SettingsRow>
					<Show when={props.admin && !props.isDefault}>
						<SettingsRow
							inline
							label="Workspace default"
							description="Used when a task doesn't pick an agent"
						>
							<Button size="sm" onClick={() => void makeDefault()}>
								Make default
							</Button>
						</SettingsRow>
					</Show>
					<Show when={props.admin && props.provider.custom}>
						<SettingsRow
							inline
							danger
							label="Remove agent"
							description="Added here as an ACP agent"
						>
							<Button size="sm" variant="danger" onClick={() => void remove()}>
								Remove
							</Button>
						</SettingsRow>
					</Show>
				</div>
			</Stack>
		</Dialog>
	);
}

/** Add an agent that speaks the Agent Client Protocol, by the command that starts it. */
function AddAgentDialog(props: { open: boolean; onClose: () => void }): JSX.Element {
	const auth = useAuth();
	const [name, setName] = createSignal("");
	const [command, setCommand] = createSignal("");
	const [busy, setBusy] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);
	const close = () => {
		setName("");
		setCommand("");
		setError(null);
		props.onClose();
	};
	async function add(): Promise<void> {
		const token = auth.token();
		if (!token || busy()) return;
		setBusy(true);
		setError(null);
		try {
			await machineService.addAgent(token, { name: name().trim(), command: command().trim() });
			await providersStore.reload(token, "");
			notify({ title: `${name().trim()} added` });
			close();
		} catch (cause) {
			setError(reason(cause, "Could not add it"));
		} finally {
			setBusy(false);
		}
	}
	return (
		<Dialog
			open={props.open}
			onClose={close}
			title="Add an ACP agent"
			description="Any agent that speaks the Agent Client Protocol works, by the command that starts it."
			footer={
				<>
					<Button onClick={close}>Cancel</Button>
					<Button
						variant="primary"
						disabled={busy() || !name().trim() || !command().trim()}
						onClick={() => void add()}
					>
						Add agent
					</Button>
				</>
			}
		>
			<Stack gap={4}>
				<Show when={error()}>{(message) => <Alert tone="danger" title={message()} />}</Show>
				<Field label="Name">
					{(id) => (
						<Input
							id={id}
							maxlength={60}
							placeholder="Gemini"
							value={name()}
							onInput={(event) => setName(event.currentTarget.value)}
						/>
					)}
				</Field>
				<Field label="Command" hint="Run on this machine; the program must be on its PATH.">
					{(id) => (
						<Input
							id={id}
							class="font-mono"
							placeholder="gemini --experimental-acp"
							spellcheck={false}
							autocapitalize="off"
							value={command()}
							onInput={(event) => setCommand(event.currentTarget.value)}
						/>
					)}
				</Field>
				<Text size="caption" tone="subtle">
					It shows up in the model picker for new threads as soon as it is added.
				</Text>
			</Stack>
		</Dialog>
	);
}
