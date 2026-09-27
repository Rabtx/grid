import { useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, Show } from "solid-js";

import {
	Alert,
	Button,
	Code,
	IconButton,
	RestoreIcon,
	SettingsGroup,
	SettingsRow,
	Skeleton,
	SpinnerIcon,
	Stack,
	Switch,
	Text,
	TextLink,
} from "@/kit";
import { useAuth } from "@/modules/auth";
import { ModelPicker, ModePicker } from "@/modules/chat/components/pickers";
import { chatService } from "@/modules/chat/services/chat.service";
import { providersStore } from "@/modules/chat/stores/providers";
import type { ChatProvider, ProviderSettings } from "@/modules/chat/types/chat.types";
import { environmentsStore, MachinePicker, scopeFor } from "@/modules/environments";

import { SettingsPage } from "./settings-page";

function ago(iso: string | null | undefined): string {
	if (!iso) return "never";
	const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes} min ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours} h ago`;
	return `${Math.round(hours / 24)} d ago`;
}

/**
 * Settings → Agents: each coding agent on this machine, whether new threads offer it, the model,
 * effort and mode new threads start with, and its model list — kept, and refreshed only here.
 */
export function AgentsScreen(): JSX.Element {
	const auth = useAuth();
	// Each machine has its own agents; this one unless an environment is picked.
	const [machine, setMachine] = createSignal<string | null>(null);
	const scope = () => scopeFor(machine());

	// Read afresh on every visit: coming back from an install or sign-in shows where it stands.
	createEffect(
		() => [auth.token(), scope()] as const,
		([token, where]) => {
			if (token) void providersStore.reload(token, where);
		},
	);
	const machineLabel = () =>
		machine() ? (environmentsStore.labelOf(machine()) ?? "that machine") : "this machine";

	return (
		<SettingsPage
			title="Agents"
			description="The coding agents on this machine, and what new threads start with. Model lists are kept; refresh one when an agent gains models."
			actions={
				<div class="w-full md:w-56">
					<MachinePicker value={machine()} onChange={setMachine} />
				</div>
			}
		>
			<Show when={providersStore.error(scope())}>
				{(message) => <Alert tone="danger" title={message()} />}
			</Show>
			<Show
				when={providersStore.providers(scope()).length > 0}
				fallback={
					<Stack gap={3}>
						<Skeleton class="h-28" />
						<Skeleton class="h-28" />
					</Stack>
				}
			>
				<For each={providersStore.providers(scope())}>
					{(provider) => (
						<AgentCard provider={provider} scope={scope()} machineLabel={machineLabel()} />
					)}
				</For>
			</Show>
		</SettingsPage>
	);
}

function AgentCard(props: {
	provider: ChatProvider;
	scope: string;
	machineLabel: string;
}): JSX.Element {
	const auth = useAuth();
	const navigate = useNavigate();
	const [settingUp, setSettingUp] = createSignal(false);

	/**
	 * Install or sign in: a terminal on the agent's machine runs its vendor's own command, so
	 * every sign-in (a link, a device code, a code to paste back) works as the vendor intends.
	 */
	async function runSetup(step: "install" | "sign-in"): Promise<void> {
		const token = auth.token();
		if (!token || settingUp()) return;
		setSettingUp(true);
		setError(null);
		try {
			const terminal = await chatService.setupProvider(token, props.provider.id, step, props.scope);
			navigate(`/terminal/${terminal.id}`);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not open a terminal for that");
		} finally {
			setSettingUp(false);
		}
	}
	const [refreshing, setRefreshing] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);
	const settings = (): ProviderSettings => props.provider.settings ?? {};
	const enabled = () => settings().enabled !== false;
	const model = () => settings().model ?? props.provider.models[0]?.id ?? "";
	const currentModel = () => props.provider.models.find((item) => item.id === model());
	const efforts = () => currentModel()?.efforts ?? [];

	async function save(change: ProviderSettings): Promise<void> {
		const token = auth.token();
		if (!token) return;
		setError(null);
		try {
			await providersStore.saveSettings(
				token,
				props.provider.id,
				{ ...settings(), ...change },
				props.scope,
			);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not save");
		}
	}

	async function refresh(): Promise<void> {
		const token = auth.token();
		if (!token) return;
		setRefreshing(true);
		setError(null);
		try {
			await providersStore.refresh(token, props.provider.id, props.scope);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not refresh the models");
		} finally {
			setRefreshing(false);
		}
	}

	return (
		<SettingsGroup
			title={props.provider.name}
			description={
				props.provider.available
					? `${props.provider.models.length} model${props.provider.models.length === 1 ? "" : "s"} · updated ${ago(props.provider.refreshedAt)}`
					: `Not installed on ${props.machineLabel}`
			}
			action={
				<Show when={props.provider.available}>
					<div class="flex items-center gap-2">
						<IconButton
							size="sm"
							label={refreshing() ? "Refreshing models" : "Refresh models"}
							disabled={refreshing()}
							onClick={() => void refresh()}
						>
							<Show when={refreshing()} fallback={<RestoreIcon size="sm" />}>
								<SpinnerIcon size="sm" />
							</Show>
						</IconButton>
						<Switch
							label={`Offer ${props.provider.name} in new threads`}
							checked={enabled()}
							onChange={(on) => void save({ enabled: on })}
						/>
					</div>
				</Show>
			}
		>
			<SetupRow
				provider={props.provider}
				machineLabel={props.machineLabel}
				busy={settingUp()}
				onSetup={(step) => void runSetup(step)}
			/>
			<Show when={error()}>
				{(message) => (
					<div class="px-4 py-3">
						<Alert tone="danger" title={message()} />
					</div>
				)}
			</Show>
			<Show
				when={props.provider.available && enabled()}
				fallback={
					<Show when={props.provider.available}>
						<SettingsRow
							label="Hidden from new threads"
							description="Turn it on to offer it in the model picker again."
						>
							{null}
						</SettingsRow>
					</Show>
				}
			>
				<SettingsRow
					label="New threads start with"
					description="The model, effort and access it opens with."
				>
					<Show when={props.provider.models.length > 0}>
						<ModelPicker
							models={props.provider.models}
							model={model()}
							onModel={(id) => {
								// Keep the effort when the new model has that level too.
								const levels = props.provider.models.find((item) => item.id === id)?.efforts ?? [];
								const effort = levels.some((level) => level.id === settings().effort)
									? settings().effort
									: undefined;
								void save({ model: id, effort });
							}}
							efforts={efforts()}
							effort={settings().effort ?? currentModel()?.defaultEffort ?? null}
							onEffort={(id) => void save({ effort: id })}
						/>
					</Show>
					<Show when={props.provider.modes.length > 0}>
						<ModePicker
							modes={props.provider.modes}
							mode={settings().mode ?? props.provider.defaultMode ?? props.provider.modes[0].id}
							onMode={(id) => void save({ mode: id })}
						/>
					</Show>
				</SettingsRow>
			</Show>
		</SettingsGroup>
	);
}

/** Install an agent that is missing, or sign it in; with where its sign-in stands. */
function SetupRow(props: {
	provider: ChatProvider;
	machineLabel: string;
	busy: boolean;
	onSetup: (step: "install" | "sign-in") => void;
}): JSX.Element {
	const setup = () => props.provider.setup;
	const status = () => {
		const signedIn = setup()?.signedIn;
		if (signedIn === true) return "Signed in";
		if (signedIn === false)
			return setup()?.signInOptional ? "Not signed in (optional)" : "Not signed in";
		return null;
	};

	return (
		<Show
			when={setup()}
			fallback={
				// A machine whose Grid predates installing from here sends no setup details.
				<Show when={!props.provider.available}>
					<div class="px-4 py-3.5">
						<Text tone="subtle">
							Grid on {props.machineLabel} is too old to install agents from here. Update it (in a
							terminal there: <Code>git pull</Code> in its Grid folder, then restart Grid, or
							rebuild the Codespace), and Install appears.
						</Text>
					</div>
				</Show>
			}
		>
			{(current) => (
				<Show
					when={props.provider.available}
					fallback={
						<SettingsRow
							inline
							label="Install"
							description={
								current().canInstall
									? `Runs ${props.provider.name}'s official installer in a terminal on ${props.machineLabel}.`
									: `Grid cannot install ${props.provider.name} for you.`
							}
						>
							<Show
								when={current().canInstall}
								fallback={
									<Show when={current().docs}>
										{(docs) => (
											<TextLink
												tone="accent"
												href={docs()}
												target="_blank"
												rel="noopener noreferrer"
											>
												How to install
											</TextLink>
										)}
									</Show>
								}
							>
								<Button
									variant="primary"
									size="sm"
									disabled={props.busy}
									onClick={() => props.onSetup("install")}
								>
									Install
								</Button>
							</Show>
						</SettingsRow>
					}
				>
					<Show when={current().canSignIn}>
						<SettingsRow
							inline
							label={status() ?? "Sign in"}
							description="Uses your own account with the agent's vendor."
						>
							<Button
								variant={
									current().signedIn === false && !current().signInOptional ? "primary" : "ghost"
								}
								size="sm"
								disabled={props.busy}
								onClick={() => props.onSetup("sign-in")}
							>
								{current().signedIn === true ? "Sign in again" : "Sign in"}
							</Button>
						</SettingsRow>
					</Show>
				</Show>
			)}
		</Show>
	);
}
