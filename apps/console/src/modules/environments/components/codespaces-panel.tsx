import type { JSX } from "@solidjs/web";
import { createSignal, For, onSettled, Show } from "solid-js";

import { useAuth } from "@/modules/auth";
import { Button, CopyIcon, ErrorNotice, Field, IconButton, Input, SpinnerIcon, toast } from "@/ui";

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
		<section
			aria-labelledby="codespaces-heading"
			class="mt-6 rounded-xl border border-ink/10 bg-ink/3"
		>
			<header class="flex flex-wrap items-center gap-3 px-4 py-3">
				<div class="min-w-0 flex-1">
					<h2 id="codespaces-heading" class="font-semibold text-ui">
						GitHub Codespaces
					</h2>
					<p class="text-ink/45 text-ui-xs">
						<Show when={connected()} fallback="Start, stop and connect your Codespaces from here.">
							Signed in as @{status()?.login}
						</Show>
					</p>
				</div>
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
			</header>

			<Show when={error()}>
				{(message) => (
					<div class="px-4 pb-3">
						<ErrorNotice message={message()} />
					</div>
				)}
			</Show>

			<div class="border-ink/5 border-t px-4 py-3">
				<Show when={loaded()} fallback={<SpinnerIcon class="size-4 text-ink/40" />}>
					<Show when={status()}>
						{(current) => (
							<Show
								when={connected()}
								fallback={
									<SignIn
										status={current()}
										busy={busy() !== null}
										onSignIn={() => void run("signin", githubService.signIn)}
									/>
								}
							>
								<CodespaceList
									codespaces={codespaces()}
									busy={busy()}
									onAct={(name, action) =>
										void run(`${action}:${name}`, (token) => githubService.act(token, name, action))
									}
								/>
								<NewCodespace
									login={current().login}
									busy={busy() !== null}
									onCreate={(input) =>
										void run("create", async (token) => {
											const made = await githubService.create(token, input);
											toast({ message: `Created ${made.name}` });
										})
									}
								/>
							</Show>
						)}
					</Show>
				</Show>
			</div>
		</section>
	);
}

function SignIn(props: { status: GitHubStatus; busy: boolean; onSignIn: () => void }): JSX.Element {
	async function copy(code: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(code);
			toast({ message: "Code copied" });
		} catch {
			// Clipboard refused; the code is on screen to type.
		}
	}

	return (
		<Show
			when={props.status.installed}
			fallback={
				<p class="text-ink/55 text-ui-sm">
					Install the GitHub CLI (<code class="font-mono text-ui-xs">gh</code>) on the machine Grid
					runs on to manage Codespaces here.
				</p>
			}
		>
			<Show
				when={props.status.claimedBy !== "someone-else"}
				fallback={
					<p class="text-ink/55 text-ui-sm">Someone else in this Grid has connected GitHub here.</p>
				}
			>
				<Show
					when={props.status.pending}
					fallback={
						<div class="flex flex-col items-start gap-2">
							<p class="text-ink/55 text-ui-sm">
								<Show
									when={props.status.login && props.status.canManageCodespaces}
									fallback="Sign in once; GitHub gives you a code to approve. Grid never stores your GitHub token."
								>
									This machine is already signed in to GitHub as @{props.status.login}.
								</Show>
							</p>
							<Show when={props.status.error}>
								{(message) => <ErrorNotice message={message()} />}
							</Show>
							<Button variant="primary" disabled={props.busy} onClick={props.onSignIn}>
								{props.status.login && props.status.canManageCodespaces
									? `Use @${props.status.login}`
									: "Sign in with GitHub"}
							</Button>
						</div>
					}
				>
					{(pending) => (
						<div class="flex flex-col gap-3">
							<p class="text-ink/55 text-ui-sm">
								Open GitHub, enter this code and approve. This page carries on by itself.
							</p>
							<div class="flex items-center gap-2">
								<span class="rounded-lg bg-ink/8 px-3 py-2 font-mono font-semibold text-title tracking-widest">
									{pending().code}
								</span>
								<IconButton label="Copy code" onClick={() => void copy(pending().code)}>
									<CopyIcon class="size-4" />
								</IconButton>
							</div>
							<div class="flex flex-wrap items-center gap-3">
								<a
									href={pending().url}
									target="_blank"
									rel="noopener noreferrer"
									class="focus-ring inline-flex h-control items-center rounded-md bg-accent px-3 font-medium text-canvas text-ui-sm pointer-coarse:min-h-11"
								>
									Open github.com/login/device
								</a>
								<span class="flex items-center gap-1.5 text-ink/45 text-ui-xs">
									<SpinnerIcon class="size-3.5" /> Waiting for approval…
								</span>
							</div>
						</div>
					)}
				</Show>
			</Show>
		</Show>
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
			fallback={<p class="text-ink/55 text-ui-sm">No Codespaces yet. Create one below.</p>}
		>
			<ul class="-mx-1 flex flex-col divide-y divide-ink/5">
				<For each={props.codespaces}>
					{(codespace) => (
						<li class="flex flex-wrap items-center gap-x-3 gap-y-2 px-1 py-2.5">
							<span
								aria-hidden="true"
								class={`size-2 shrink-0 rounded-full ${codespace.state === "Available" ? "bg-success" : SETTLED.has(codespace.state) ? "bg-ink/25" : "animate-pulse bg-accent"}`}
							/>
							<div class="min-w-0 flex-1">
								<p class="truncate font-medium text-ui">{codespace.displayName}</p>
								<p class="truncate text-ink/45 text-ui-xs">
									{codespace.repository} · {codespace.state}
									<Show when={codespace.environment}> · connected</Show>
								</p>
								<Show when={codespace.connecting}>
									{(job) => (
										<p class={`text-ui-xs ${job().error ? "text-danger" : "text-ink/55"}`}>
											{job().error ?? job().step}
										</p>
									)}
								</Show>
							</div>
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
						</li>
					)}
				</For>
			</ul>
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
		<details class="mt-3">
			<summary class="focus-ring cursor-pointer select-none text-ink/60 text-ui-sm hover:text-ink">
				New Codespace
			</summary>
			<form
				class="mt-3 flex flex-col gap-3 md:max-w-md"
				onSubmit={(event) => {
					event.preventDefault();
					props.onCreate({ repository: repository().trim(), branch: branch().trim() || undefined });
				}}
			>
				<Field
					label="Repository"
					hint="owner/name. Open it on the Grid repository to connect it as an environment."
				>
					<Input
						value={repository()}
						onInput={(event) => setRepository(event.currentTarget.value)}
						autocapitalize="off"
						spellcheck={false}
						required
					/>
				</Field>
				<Field label="Branch" hint="Optional: the default branch otherwise.">
					<Input
						value={branch()}
						onInput={(event) => setBranch(event.currentTarget.value)}
						autocapitalize="off"
						spellcheck={false}
					/>
				</Field>
				<div>
					<Button type="submit" variant="primary" disabled={props.busy}>
						{props.busy ? "Working…" : "Create"}
					</Button>
				</div>
			</form>
		</details>
	);
}
