import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, Show } from "solid-js";

import { useAuth } from "@/modules/auth";
import { SettingsNav } from "@/modules/settings/components/settings-nav";
import {
	Button,
	ConfirmDialog,
	ErrorNotice,
	Field,
	IconButton,
	Input,
	toast,
	TrashIcon,
} from "@/ui";

import { type Environment, environmentsService } from "../services/environments.service";
import { environmentsStore } from "../stores/environments";

/**
 * Settings → Environments: other machines running Grid (a Codespace, a VPS) that this Grid
 * drives. Pairing takes the address and a one-time code shown on the environment; after that,
 * their terminals open from here. They meet over your tailnet, and your sign-in stays here.
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
			toast({
				message: cause instanceof Error ? cause.message : "Could not remove it",
				tone: "danger",
			});
		} finally {
			setPending(false);
		}
	}

	return (
		<div class="mx-auto flex w-full max-w-[60rem] flex-col py-6 md:py-10">
			<SettingsNav />
			<header class="mb-2">
				<h1 class="sr-only">Environments</h1>
				<p class="text-ink/50 text-ui-sm">
					Other machines running Grid, such as a Codespace or a VPS. Open terminals on them from
					here. They connect over your Tailscale network, and your sign-in never leaves this Grid.
				</p>
			</header>
			<Show when={environmentsStore.error()}>
				{(message) => (
					<div class="mt-4">
						<ErrorNotice message={message()} />
					</div>
				)}
			</Show>
			<Show when={environmentsStore.environments().length > 0}>
				<ul class="mt-6 flex flex-col divide-y divide-ink/5 rounded-xl border border-ink/10 bg-ink/3">
					<For each={environmentsStore.environments()}>
						{(environment) => (
							<EnvironmentRow environment={environment} onRemove={() => setRemoving(environment)} />
						)}
					</For>
				</ul>
			</Show>
			<AddEnvironment />
			<ConfirmDialog
				open={removing() !== null}
				title={`Remove ${removing()?.label ?? "this environment"}?`}
				description="Its terminals close here, and its pairing is revoked on both sides. Pair it again with a new code to bring it back."
				confirmLabel="Remove"
				tone="danger"
				pending={pending()}
				onConfirm={() => void remove()}
				onCancel={() => setRemoving(null)}
			/>
		</div>
	);
}

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
		<li class="flex items-center gap-3 px-4 py-3">
			<span
				aria-hidden="true"
				class={`size-2 shrink-0 rounded-full ${reachable() === null ? "bg-ink/20" : reachable() ? "bg-success" : "bg-danger"}`}
			/>
			<div class="min-w-0 flex-1">
				<p class="truncate font-medium text-ui">{props.environment.label}</p>
				<p class="truncate text-ink/45 text-ui-xs">
					{props.environment.url}
					<span class="sr-only">
						{reachable() === null ? ", checking" : reachable() ? ", reachable" : ", not reachable"}
					</span>
				</p>
			</div>
			<IconButton label={`Remove ${props.environment.label}`} onClick={props.onRemove}>
				<TrashIcon class="size-4" />
			</IconButton>
		</li>
	);
}

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
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not pair");
		} finally {
			setBusy(false);
		}
	}

	return (
		<section aria-labelledby="add-environment" class="mt-8">
			<h2 id="add-environment" class="font-semibold text-ui">
				Add an environment
			</h2>
			<p class="mt-1 text-ink/50 text-ui-sm">
				On the environment, run <code class="font-mono text-ui-xs">bun run grid:pair</code>. It
				prints the address and a code that works once, for ten minutes. A Codespace joins your
				tailnet when it has a <code class="font-mono text-ui-xs">TS_AUTH_KEY</code> secret; see the
				dev container's README.
			</p>
			<form class="mt-4 flex flex-col gap-4 md:max-w-md" onSubmit={(event) => void submit(event)}>
				<Field label="Address" hint="Like http://codespace-name.your-tailnet.ts.net:4100">
					<Input
						value={url()}
						onInput={(event) => setUrl(event.currentTarget.value)}
						placeholder="http://….ts.net:4100"
						inputmode="url"
						autocomplete="off"
						autocapitalize="off"
						spellcheck={false}
						required
					/>
				</Field>
				<Field label="Pairing code">
					<Input
						value={code()}
						onInput={(event) => setCode(event.currentTarget.value)}
						placeholder="ABCD-EF23"
						autocomplete="one-time-code"
						autocapitalize="characters"
						spellcheck={false}
						required
					/>
				</Field>
				<Field label="Name" hint="Optional: how it shows in the terminal.">
					<Input
						value={label()}
						onInput={(event) => setLabel(event.currentTarget.value)}
						placeholder="My Codespace"
					/>
				</Field>
				<Show when={error()}>{(message) => <ErrorNotice message={message()} />}</Show>
				<div>
					<Button type="submit" variant="primary" disabled={busy()}>
						{busy() ? "Pairing…" : "Pair"}
					</Button>
				</div>
			</form>
		</section>
	);
}
