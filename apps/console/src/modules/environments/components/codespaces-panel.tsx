import type { JSX } from "@solidjs/web";
import { createSignal, For, onSettled, Show } from "solid-js";

import {
	Alert,
	Button,
	Disclosure,
	Field,
	Input,
	notify,
	SettingsGroup,
	Spinner,
	Stack,
	StatusDot,
	Text,
} from "@/kit";
import { useAuth } from "@/modules/auth";
import { GitHubSignIn } from "@/modules/github";

import { type Codespace, type GitHubStatus, githubService } from "../services/github.service";
import { environmentsStore } from "../stores/environments";

// Codespaces between states, and connections in progress, are read again this often.
const BUSY_POLL_MS = 3_000;
const IDLE_POLL_MS = 20_000;
const SETTLED = new Set(["Available", "Shutdown", "Failed"]);

/**
 * Settings → Environments → GitHub Codespaces: sign in with GitHub, then see your Codespaces,
 * start, stop and create them, and connect one as an environment in one tap. Grid starts it,
 * fetches its pairing code over GitHub's SSH channel and pairs over the tailnet.
 */
export function CodespacesPanel(): JSX.Element {
	const auth = useAuth();
	const [status, setStatus] = createSignal<GitHubStatus | null>(null);
	const [codespaces, setCodespaces] = createSignal<Codespace[]>([]);
	const [loaded, setLoaded] = createSignal(false);
	const [busy, setBusy] = createSignal<string | null>(null);
	const [error, setError] = createSignal<string | null>(null);

	const connected = () => status()?.claimedBy === "you";

	async function refresh(): Promise<void> {
		const token = auth.token();
		if (!token) return;
		try {
			const next = await githubService.status(token);
			setStatus(next);
			if (next.claimedBy === "you") {
				const before = new Set(
					codespaces()
						.filter((item) => item.environment)
						.map((item) => item.name),
				);
				const list = await githubService.codespaces(token);
				setCodespaces(list);
				// A connection just finished: the environment list has a new member.
				if (list.some((item) => item.environment && !before.has(item.name))) {
					void environmentsStore.load(token);
				}
			}
			setError(null);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not reach GitHub");
		} finally {
			setLoaded(true);
		}
	}

	const needsWatching = () =>
		Boolean(status()?.pending) ||
		codespaces().some((item) => item.connecting && !item.connecting.error) ||
		codespaces().some((item) => !SETTLED.has(item.state));

	onSettled(() => {
		let stopped = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const tick = async () => {
			if (document.visibilityState === "visible") await refresh();
			if (!stopped)
				timer = setTimeout(() => void tick(), needsWatching() ? BUSY_POLL_MS : IDLE_POLL_MS);
		};
		void tick();
		return () => {
			stopped = true;
			clearTimeout(timer);
		};
	});

	async function run(key: string, work: (token: string) => Promise<unknown>): Promise<void> {
		const token = auth.token();
		if (!token || busy()) return;
		setBusy(key);
		setError(null);
		try {
			await work(token);
			await refresh();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "That did not work");
		} finally {
			setBusy(null);
		}
	}

	return (
		<SettingsGroup
			title="GitHub Codespaces"
			description={
				connected()
					? `Signed in as @${status()?.login}`
					: "Start, stop and connect your Codespaces from here."
			}
			action={
				<Show when={connected()}>
					<Button
						variant="ghost"
						size="sm"
						disabled={busy() !== null}
						onClick={() => void run("signout", githubService.signOut)}
					>
						Disconnect
					</Button>
				</Show>
			}
		>
			<Show when={error()}>
				{(message) => (
					<div class="px-4 py-3">
						<Alert tone="danger" title={message()} />
					</div>
				)}
			</Show>
			<Show
				when={loaded()}
				fallback={
					<div class="px-4 py-3.5">
						<Spinner label="Checking GitHub" />
					</div>
				}
			>
				<Show when={status()}>
					{(current) => (
						<Show
							when={connected()}
							fallback={
								<div class="px-4 py-4">
									<GitHubSignIn
										status={current()}
										busy={busy() !== null}
										purpose="to manage Codespaces here"
										onSignIn={() => void run("signin", githubService.signIn)}
									/>
								</div>
							}
						>
							<CodespaceList
								codespaces={codespaces()}
								busy={busy()}
								onAct={(name, action) =>
									void run(`${action}:${name}`, (token) => githubService.act(token, name, action))
								}
							/>
							<div class="px-4 py-3">
								<NewCodespace
									login={current().login}
									busy={busy() !== null}
									onCreate={(input) =>
										void run("create", async (token) => {
											const made = await githubService.create(token, input);
											notify({ title: `Created ${made.name}`, tone: "success" });
										})
									}
								/>
							</div>
						</Show>
					)}
				</Show>
			</Show>
		</SettingsGroup>
	);
}

function CodespaceList(props: {
	codespaces: Codespace[];
	busy: string | null;
	onAct: (name: string, action: "start" | "stop" | "connect") => void;
}): JSX.Element {
	return (
		<Show
			when={props.codespaces.length > 0}
			fallback={
				<div class="px-4 py-3.5">
					<Text tone="subtle">No Codespaces yet. Create one below.</Text>
				</div>
			}
		>
			<For each={props.codespaces}>
				{(codespace) => (
					<div class="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
						<StatusDot
							status={
								codespace.state === "Available"
									? "online"
									: SETTLED.has(codespace.state)
										? "offline"
										: "running"
							}
							label={codespace.state}
						/>
						<Stack gap={0.5} class="min-w-0 flex-1">
							<Text tone="strong" truncate>
								{codespace.displayName}
							</Text>
							<Text size="caption" tone="subtle" truncate>
								{codespace.repository} · {codespace.state}
								{codespace.environment ? " · connected" : ""}
							</Text>
							<Show when={codespace.connecting}>
								{(job) => (
									<Text size="caption" tone={job().error ? "danger" : "subtle"}>
										{job().error ?? job().step}
									</Text>
								)}
							</Show>
						</Stack>
						<div class="flex items-center gap-1.5">
							<Show
								when={
									!codespace.environment && !(codespace.connecting && !codespace.connecting.error)
								}
							>
								<Button
									size="sm"
									variant="primary"
									disabled={props.busy !== null}
									onClick={() => props.onAct(codespace.name, "connect")}
								>
									Connect
								</Button>
							</Show>
							<Show when={codespace.state === "Available"}>
								<Button
									size="sm"
									disabled={props.busy !== null}
									onClick={() => props.onAct(codespace.name, "stop")}
								>
									Stop
								</Button>
							</Show>
							<Show when={codespace.state === "Shutdown"}>
								<Button
									size="sm"
									disabled={props.busy !== null}
									onClick={() => props.onAct(codespace.name, "start")}
								>
									Start
								</Button>
							</Show>
						</div>
					</div>
				)}
			</For>
		</Show>
	);
}

function NewCodespace(props: {
	login: string | null;
	busy: boolean;
	onCreate: (input: { repository: string; branch?: string }) => void;
}): JSX.Element {
	const [repository, setRepository] = createSignal(props.login ? `${props.login}/grid` : "");
	const [branch, setBranch] = createSignal("");

	return (
		<Disclosure summary="New Codespace">
			<form
				class="pt-2"
				onSubmit={(event) => {
					event.preventDefault();
					props.onCreate({ repository: repository().trim(), branch: branch().trim() || undefined });
				}}
			>
				<Stack gap={3}>
					<div class="grid gap-3 md:grid-cols-2">
						<Field
							label="Repository"
							hint="owner/name. Open it on the Grid repository to connect it as an environment."
						>
							{(id) => (
								<Input
									id={id}
									value={repository()}
									onInput={(event) => setRepository(event.currentTarget.value)}
									autocapitalize="off"
									spellcheck={false}
									required
								/>
							)}
						</Field>
						<Field label="Branch" hint="Optional: the default branch otherwise.">
							{(id) => (
								<Input
									id={id}
									value={branch()}
									onInput={(event) => setBranch(event.currentTarget.value)}
									autocapitalize="off"
									spellcheck={false}
								/>
							)}
						</Field>
					</div>
					<div>
						<Button type="submit" variant="primary" disabled={props.busy}>
							{props.busy ? "Working…" : "Create"}
						</Button>
					</div>
				</Stack>
			</form>
		</Disclosure>
	);
}
