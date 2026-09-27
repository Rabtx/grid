import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, Show } from "solid-js";

import {
	Alert,
	Button,
	Code,
	ConfirmDialog,
	Field,
	IconButton,
	Input,
	notify,
	SettingsGroup,
	Stack,
	StatusDot,
	Text,
	TrashIcon,
} from "@/kit";
import { useAuth } from "@/modules/auth";
import { SettingsPage } from "@/modules/settings/components/settings-page";

import { type Environment, environmentsService } from "../services/environments.service";
import { environmentsStore } from "../stores/environments";

import { CodespacesPanel } from "./codespaces-panel";

/**
 * Settings → Environments: other machines running Grid (a Codespace, a VPS) that this Grid
 * drives. Pairing takes the address and a one-time code shown on the environment; after that,
 * their terminals and agents open from here. They meet over your tailnet, and your sign-in stays
 * here.
 */
export function EnvironmentsScreen(): JSX.Element {
	const auth = useAuth();
	const [removing, setRemoving] = createSignal<Environment | null>(null);
	const [pending, setPending] = createSignal(false);

	createEffect(
		() => auth.token(),
		(token) => {
			if (token) void environmentsStore.load(token);
		},
	);

	async function remove(): Promise<void> {
		const token = auth.token();
		const target = removing();
		if (!token || !target) return;
		setPending(true);
		try {
			await environmentsStore.remove(token, target.id);
			setRemoving(null);
		} catch (cause) {
			setRemoving(null);
			notify({
				title: cause instanceof Error ? cause.message : "Could not remove it",
				tone: "danger",
			});
		} finally {
			setPending(false);
		}
	}

	return (
		<SettingsPage
			title="Environments"
			description="Other machines running Grid, such as a Codespace or a VPS. They connect over your Tailscale network, and your sign-in never leaves this Grid."
		>
			<Show when={environmentsStore.error()}>
				{(message) => <Alert tone="danger" title={message()} />}
			</Show>

			<SettingsGroup
				title="Machines"
				description="Paired with this Grid. Their terminals and agents open from here."
			>
				<Show
					when={environmentsStore.environments().length > 0}
					fallback={
						<div class="px-4 py-3.5">
							<Text tone="subtle">None yet. Connect a Codespace or add a machine below.</Text>
						</div>
					}
				>
					<For each={environmentsStore.environments()}>
						{(environment) => (
							<EnvironmentRow environment={environment} onRemove={() => setRemoving(environment)} />
						)}
					</For>
				</Show>
			</SettingsGroup>

			<CodespacesPanel />

			<AddEnvironment />

			<ConfirmDialog
				open={removing() !== null}
				title={`Remove ${removing()?.label ?? "this environment"}?`}
				description="Its terminals close here, and its pairing is revoked on both sides. Pair it again with a new code to bring it back."
				confirm="Remove"
				danger
				pending={pending()}
				stayOpen
				onConfirm={() => void remove()}
				onClose={() => setRemoving(null)}
			/>
		</SettingsPage>
	);
}

/** A paired machine: whether it answers right now, its name and address, and removing it. */
function EnvironmentRow(props: { environment: Environment; onRemove: () => void }): JSX.Element {
	const auth = useAuth();
	const [reachable, setReachable] = createSignal<boolean | null>(null);

	createEffect(
		() => auth.token(),
		(token) => {
			if (!token) return;
			void environmentsService
				.reachable(token, props.environment.id)
				.then(setReachable, () => setReachable(false));
		},
	);

	return (
		<div class="flex items-center gap-3 px-4 py-3">
			<StatusDot
				status={reachable() === null ? "offline" : reachable() ? "online" : "error"}
				label={reachable() === null ? "Checking" : reachable() ? "Reachable" : "Not reachable"}
			/>
			<Stack gap={0.5} class="min-w-0 flex-1">
				<Text tone="strong" truncate>
					{props.environment.label}
				</Text>
				<Text size="caption" tone="subtle" mono truncate>
					{props.environment.url}
				</Text>
			</Stack>
			<IconButton
				size="sm"
				variant="danger"
				label={`Remove ${props.environment.label}`}
				onClick={props.onRemove}
			>
				<TrashIcon size="sm" />
			</IconButton>
		</div>
	);
}

/** Pair a machine by its address and the one-time code it prints. */
function AddEnvironment(): JSX.Element {
	const auth = useAuth();
	const [url, setUrl] = createSignal("");
	const [code, setCode] = createSignal("");
	const [label, setLabel] = createSignal("");
	const [busy, setBusy] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		const token = auth.token();
		if (!token || busy()) return;
		setBusy(true);
		setError(null);
		try {
			await environmentsStore.add(token, {
				url: url().trim(),
				code: code().trim(),
				label: label().trim(),
			});
			setUrl("");
			setCode("");
			setLabel("");
			notify({ title: "Paired", tone: "success" });
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not pair");
		} finally {
			setBusy(false);
		}
	}

	return (
		<SettingsGroup
			title="Add a machine by address"
			description="For a VPS, another laptop, or a Codespace without GitHub here."
		>
			<form class="px-4 py-4" onSubmit={(event) => void submit(event)}>
				<Stack gap={4}>
					<Text tone="subtle">
						On it, run <Code>bun run grid:pair</Code>. It prints the address and a code that works
						once, for ten minutes. A Codespace joins your tailnet when it has a{" "}
						<Code>TS_AUTH_KEY</Code> secret; see the dev container's README.
					</Text>
					<div class="grid gap-4 md:grid-cols-2">
						<Field label="Address" hint="Like http://codespace-name.your-tailnet.ts.net:4100">
							{(id) => (
								<Input
									id={id}
									value={url()}
									onInput={(event) => setUrl(event.currentTarget.value)}
									placeholder="http://….ts.net:4100"
									inputmode="url"
									autocomplete="off"
									autocapitalize="off"
									spellcheck={false}
									required
								/>
							)}
						</Field>
						<Field label="Pairing code">
							{(id) => (
								<Input
									id={id}
									value={code()}
									onInput={(event) => setCode(event.currentTarget.value)}
									placeholder="ABCD-EF23"
									autocomplete="one-time-code"
									autocapitalize="characters"
									spellcheck={false}
									class="font-mono"
									required
								/>
							)}
						</Field>
						<Field label="Name" hint="Optional: how it shows in the terminal.">
							{(id) => (
								<Input
									id={id}
									value={label()}
									onInput={(event) => setLabel(event.currentTarget.value)}
									placeholder="My Codespace"
								/>
							)}
						</Field>
					</div>
					<Show when={error()}>{(message) => <Alert tone="danger" title={message()} />}</Show>
					<div>
						<Button type="submit" variant="primary" disabled={busy()}>
							{busy() ? "Pairing…" : "Pair"}
						</Button>
					</div>
				</Stack>
			</form>
		</SettingsGroup>
	);
}
