import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, Show } from "solid-js";

import { useAuth } from "@/modules/auth";
import { ModelPicker, ModePicker } from "@/modules/chat/components/pickers";
import { providersStore } from "@/modules/chat/stores/providers";
import { MachinePicker, scopeFor } from "@/modules/environments";
import type { ChatProvider, ProviderSettings } from "@/modules/chat/types/chat.types";
import { Button, ErrorNotice, RestoreIcon, Skeleton, SpinnerIcon } from "@/ui";

import { NotificationsCard } from "./notifications-card";
import { SettingsNav } from "./settings-nav";

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

	createEffect(
		() => [auth.token(), scope()] as const,
		([token, where]) => {
			if (token) void providersStore.load(token, where);
		},
	);

	return (
		<div class="mx-auto flex w-full max-w-[60rem] flex-col py-6 md:py-10">
			<SettingsNav />
			<header class="mb-2">
				{/* The tab above names the page; the heading stays for screen readers. */}
				<h1 class="sr-only">Agents</h1>
				<p class="text-ink/50 text-ui-sm">
					The coding agents installed on this machine. Model lists are kept; refresh one when an
					agent gains models.
				</p>
			</header>
			<div class="mt-4 md:max-w-xs">
				<MachinePicker value={machine()} onChange={setMachine} />
			</div>
			<Show when={providersStore.error(scope())}>
				{(message) => (
					<div class="mt-4">
						<ErrorNotice message={message()} />
					</div>
				)}
			</Show>
			<Show
				when={providersStore.providers(scope()).length > 0}
				fallback={
					<div class="mt-6 flex flex-col gap-3" aria-hidden="true">
						<Skeleton class="h-28" />
						<Skeleton class="h-28" />
					</div>
				}
			>
				<div class="mt-6 flex flex-col gap-4">
					<For each={providersStore.providers(scope())}>
						{(provider) => <AgentCard provider={provider} scope={scope()} />}
					</For>
				</div>
			</Show>
			<div class="mt-4">
				<NotificationsCard />
			</div>
		</div>
	);
}

function AgentCard(props: { provider: ChatProvider; scope: string }): JSX.Element {
	const auth = useAuth();
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
		<section
			aria-label={props.provider.name}
			class={`rounded-xl border border-ink/10 bg-ink/3 ${props.provider.available ? "" : "opacity-70"}`}
		>
			<header class="flex flex-wrap items-center gap-3 px-4 py-3">
				<div class="min-w-0 flex-1">
					<h2 class="font-semibold text-ui">{props.provider.name}</h2>
					<p class="text-ink/45 text-ui-xs">
						{props.provider.available
							? `${props.provider.models.length} model${props.provider.models.length === 1 ? "" : "s"} · updated ${ago(props.provider.refreshedAt)}`
							: "Not installed on this machine"}
					</p>
				</div>
				<Show when={props.provider.available}>
					<Button variant="ghost" disabled={refreshing()} onClick={() => void refresh()}>
						<Show when={refreshing()} fallback={<RestoreIcon class="size-4" />}>
							<SpinnerIcon class="size-4" />
						</Show>
						<span class="hidden sm:inline">{refreshing() ? "Refreshing…" : "Refresh models"}</span>
						<span class="sr-only sm:hidden">Refresh models</span>
					</Button>
					<button
						type="button"
						aria-pressed={enabled() ? "true" : "false"}
						aria-label={`Offer ${props.provider.name} in new threads`}
						title={enabled() ? "Offered in new threads" : "Hidden from new threads"}
						onClick={() => void save({ enabled: !enabled() })}
						class="focus-ring relative h-5 w-9 shrink-0 rounded-full bg-ink/15 p-0 transition-colors duration-fast aria-pressed:bg-accent pointer-coarse:h-7 pointer-coarse:w-12"
					>
						<span
							class={`absolute top-0.5 left-0 size-4 rounded-full bg-canvas shadow-sm transition-transform duration-fast pointer-coarse:size-6 ${enabled() ? "translate-x-4.5 pointer-coarse:translate-x-5.5" : "translate-x-0.5"}`}
						/>
					</button>
				</Show>
			</header>
			<Show when={error()}>
				{(message) => (
					<div class="px-4 pb-3">
						<ErrorNotice message={message()} />
					</div>
				)}
			</Show>
			<Show when={props.provider.available && enabled()}>
				<div class="flex flex-col gap-3 border-ink/5 border-t px-4 py-3 sm:flex-row sm:items-center">
					<p class="shrink-0 text-ink/55 text-ui-sm sm:w-40">New threads start with</p>
					<div class="flex min-w-0 flex-wrap items-center gap-1.5">
						<Show when={props.provider.models.length > 0}>
							<ModelPicker
								models={props.provider.models}
								model={model()}
								onModel={(id) => {
									// Keep the effort when the new model has that level too.
									const levels =
										props.provider.models.find((item) => item.id === id)?.efforts ?? [];
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
					</div>
				</div>
			</Show>
		</section>
	);
}
