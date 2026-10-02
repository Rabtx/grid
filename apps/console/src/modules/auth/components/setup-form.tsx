import { useSearchParams } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";

import {
	AgentLogo,
	Alert,
	AuthCard,
	AuthHead,
	Badge,
	Button,
	ChoiceCards,
	Field,
	GlobeIcon,
	Input,
	LaptopIcon,
	LinkIcon,
	PasswordInput,
	Skeleton,
	Splash,
	Text,
	WorkspaceMark,
} from "@/kit";
import { activeWorkspace, rememberWorkspace } from "@/lib/active-workspace";
import { runnerUp } from "@/lib/runner-health";
import { providersStore } from "@/modules/chat/stores/providers";

import { useAuth } from "../context/auth-context";
import { slugInput, slugify } from "../lib/slug";

type Step = "account" | "workspace" | "machine" | "agent";

/** The agent a new chat opens with; the chat screen keeps the same key. */
const AGENT_KEY = "grid.chat.agent";

/** A username from an email: its local part, in the characters a username allows. */
export function usernameFrom(email: string): string {
	const local = email.split("@")[0]?.toLowerCase() ?? "";
	const cleaned = local.replace(/[^a-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "");
	return (cleaned.length >= 3 ? cleaned : `${cleaned}-owner`.replace(/^-/, "")).slice(0, 64);
}

/** Where the new workspace lives, for leaving setup. */
function workspacePath(path = ""): string {
	const slug = activeWorkspace();
	return slug ? `/${encodeURIComponent(slug)}${path}` : path || "/";
}

/** A quiet text button under the main one: Back, Skip for now. */
function Quiet(props: { onClick: () => void; children: JSX.Element }): JSX.Element {
	return (
		<Button variant="ghost" onClick={() => props.onClick()} class="w-full">
			{props.children}
		</Button>
	);
}

/**
 * First run of a Grid (Figma 03–06 · Setup): the link printed when it started carries a one-time
 * code. With it the person who installed Grid creates their account, then names the workspace
 * (both are created together, and they are signed in), then picks where agents run and their first
 * agent. The last two steps can be left for later.
 */
export function SetupForm(): JSX.Element {
	const auth = useAuth();
	const [search, setSearch] = useSearchParams<{ step?: string; code?: string }>();
	const code = () => search.code ?? "";

	// Signed in, setup is past the account: the machine and agent steps remain.
	const signedIn = () => Boolean(auth.token() || auth.restoring());
	const step = (): Step => {
		const asked = search.step;
		if (signedIn()) return asked === "agent" ? "agent" : "machine";
		// The workspace step needs the account typed first (a reload there starts over).
		const account = email().includes("@") && password().length >= 12;
		return asked === "workspace" && code() && account ? "workspace" : "account";
	};
	const go = (next: Step) => setSearch({ step: next });

	const [name, setName] = createSignal("");
	const [email, setEmail] = createSignal("");
	const [password, setPassword] = createSignal("");
	const [workspace, setWorkspace] = createSignal("");
	// The address follows the workspace name until someone edits it.
	const [slug, setSlug] = createSignal<string | null>(null);
	const workspaceSlug = () => slug() ?? slugify(workspace());
	const [error, setError] = createSignal<string | null>(null);
	const [pending, setPending] = createSignal(false);

	function toWorkspace(event: SubmitEvent): void {
		event.preventDefault();
		setError(null);
		go("workspace");
	}

	async function create(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		setError(null);
		setPending(true);
		try {
			await auth.setUp({
				code: code(),
				email: email(),
				username: usernameFrom(email()),
				password: password(),
				displayName: name().trim() || undefined,
				workspace: { name: workspace(), slug: workspaceSlug() },
			});
			rememberWorkspace(workspaceSlug());
			// Reloaded so every request from here carries the new workspace.
			window.location.replace("/setup?step=machine");
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Setup failed");
		} finally {
			setPending(false);
		}
	}

	const errorAlert = () => (
		<Show when={error()}>{(message) => <Alert tone="danger" title={message()} />}</Show>
	);

	return (
		<Show
			when={auth.ready() || !search.step || code()}
			fallback={<Splash message="Opening setup…" />}
		>
			<AuthCard>
				<Show when={step() === "account"}>
					<Show
						when={code()}
						fallback={
							<AuthHead title="Set up Grid">
								Open the setup link Grid printed when it started. It is also in setup-link.txt in
								Grid's data folder.
							</AuthHead>
						}
					>
						<form class="flex flex-col gap-6" onSubmit={toWorkspace}>
							<AuthHead title="Set up Grid">
								Create the owner account. You'll invite your team next.
							</AuthHead>
							<div class="flex flex-col gap-4">
								<Field label="Full name" pill>
									{(id) => (
										<Input
											id={id}
											shape="pill"
											autofocus
											placeholder="Your name"
											autocomplete="name"
											enterkeyhint="next"
											value={name()}
											onInput={(event) => setName(event.currentTarget.value)}
										/>
									)}
								</Field>
								<Field label="Email" pill>
									{(id) => (
										<Input
											id={id}
											shape="pill"
											type="email"
											required
											placeholder="you@company.com"
											autocomplete="email"
											inputmode="email"
											enterkeyhint="next"
											value={email()}
											onInput={(event) => setEmail(event.currentTarget.value)}
										/>
									)}
								</Field>
								<Field
									label="Password"
									pill
									hint="Use a passphrase. You can add a passkey after setup."
								>
									{(id) => (
										<PasswordInput
											id={id}
											shape="pill"
											required
											minlength={12}
											placeholder="At least 12 characters"
											autocomplete="new-password"
											enterkeyhint="next"
											value={password()}
											onInput={(event) => setPassword(event.currentTarget.value)}
										/>
									)}
								</Field>
							</div>
							{errorAlert()}
							<Button type="submit" variant="primary" size="xl" class="w-full">
								Continue
							</Button>
							<Text size="body" tone="subtle" class="md:text-center">
								This setup link works only once.
							</Text>
						</form>
					</Show>
				</Show>

				<Show when={step() === "workspace"}>
					<form class="flex flex-col gap-6" onSubmit={(event) => void create(event)}>
						<AuthHead title="Name your workspace">
							Your company's home for projects, people and agents.
						</AuthHead>
						<div class="flex items-center gap-3">
							<WorkspaceMark name={workspace().trim() || "Workspace"} size="lg" />
							<div class="flex min-w-0 flex-col">
								<Text weight="medium" tone="strong">
									Workspace icon
								</Text>
								<Text size="caption" tone="subtle">
									Drawn from its name; change it in Settings.
								</Text>
							</div>
						</div>
						<div class="flex flex-col gap-4">
							<Field label="Workspace name" pill>
								{(id) => (
									<Input
										id={id}
										shape="pill"
										required
										autofocus
										placeholder="Acme"
										enterkeyhint="next"
										value={workspace()}
										onInput={(event) => setWorkspace(event.currentTarget.value)}
									/>
								)}
							</Field>
							<Field
								label="Workspace address"
								pill
								hint={`Your team opens it at ${window.location.host}/${workspaceSlug() || "acme"}`}
							>
								{(id) => (
									<Input
										id={id}
										shape="pill"
										required
										minlength={2}
										autocapitalize="off"
										enterkeyhint="go"
										value={workspaceSlug()}
										onInput={(event) => setSlug(slugInput(event.currentTarget.value))}
									/>
								)}
							</Field>
						</div>
						{errorAlert()}
						<div class="flex flex-col gap-2">
							<Button type="submit" variant="primary" size="xl" disabled={pending()} class="w-full">
								{pending() ? "Setting up…" : "Continue"}
							</Button>
							<Quiet onClick={() => go("account")}>Back</Quiet>
						</div>
					</form>
				</Show>

				<Show when={step() === "machine"}>
					<MachineStep onNext={() => go("agent")} />
				</Show>

				<Show when={step() === "agent"}>
					<AgentStep onBack={() => go("machine")} />
				</Show>
			</AuthCard>
		</Show>
	);
}

type Machine = "this" | "pair" | "codespace";

/** Figma 05 · Connect a machine: where agents run, this machine by default. */
function MachineStep(props: { onNext: () => void }): JSX.Element {
	const [choice, setChoice] = createSignal<Machine>("this");
	const next = () => {
		if (choice() === "this") props.onNext();
		else window.location.replace(workspacePath("/settings/environments"));
	};
	return (
		<div class="flex flex-col gap-6">
			<AuthHead title="Connect a machine">Agents run where your code lives. Pick where.</AuthHead>
			<ChoiceCards
				label="Where agents run"
				value={choice()}
				onChange={setChoice}
				options={[
					{
						value: "this",
						label: "This machine",
						description: `${window.location.hostname} · the Grid you set up`,
						icon: <LaptopIcon />,
						badge: runnerUp() ? (
							<Badge tone="success" dot>
								Online
							</Badge>
						) : (
							<Badge>Offline</Badge>
						),
					},
					{
						value: "pair",
						label: "Pair another Grid",
						description: "A laptop, VPS or server running Grid",
						icon: <LinkIcon />,
					},
					{
						value: "codespace",
						label: "GitHub Codespace",
						description: "A cloud machine started from a repo",
						icon: <GlobeIcon />,
					},
				]}
			/>
			<div class="flex flex-col gap-2">
				<Button variant="primary" size="xl" onClick={next} class="w-full">
					Continue
				</Button>
				<Quiet onClick={() => window.location.replace(workspacePath("/"))}>Skip for now</Quiet>
			</div>
		</div>
	);
}

/** Figma 06 · Pick an agent: the agents on this machine, the ready ones first. */
function AgentStep(props: { onBack: () => void }): JSX.Element {
	const auth = useAuth();
	const [loaded, setLoaded] = createSignal(false);
	createEffect(
		() => auth.token(),
		(token) => {
			if (token) void providersStore.load(token).finally(() => setLoaded(true));
		},
	);
	const agents = createMemo(() =>
		[...providersStore.providers()].sort((a, b) => Number(b.available) - Number(a.available)),
	);
	const [picked, setPicked] = createSignal<string | null>(null);
	const choice = () => picked() ?? agents().find((agent) => agent.available)?.id ?? agents()[0]?.id;
	const chosen = () => agents().find((agent) => agent.id === choice());

	function finish(): void {
		const agent = chosen();
		if (!agent) return;
		if (agent.available) {
			try {
				localStorage.setItem(AGENT_KEY, agent.id);
			} catch {
				// Not remembered; the chat picks its own first agent.
			}
			window.location.replace(workspacePath("/chat"));
		} else {
			// Not on this machine yet: Settings installs and signs it in.
			window.location.replace(workspacePath("/settings/agents"));
		}
	}

	return (
		<div class="flex flex-col gap-6">
			<AuthHead title="Pick your first agent">
				It works on this machine. You can add more anytime.
			</AuthHead>
			<Show when={providersStore.error()}>
				{(message) => <Alert tone="danger" title={message()} />}
			</Show>
			<Show
				when={agents().length > 0}
				fallback={
					<Show when={!providersStore.error() && !loaded()}>
						<div class="flex flex-col gap-2">
							<For each={[0, 1, 2]}>{() => <Skeleton class="h-14" />}</For>
						</div>
					</Show>
				}
			>
				<ChoiceCards
					label="First agent"
					value={choice() ?? ""}
					onChange={setPicked}
					options={agents().map((agent) => ({
						value: agent.id,
						label: agent.name,
						description: agent.available ? "Found on this machine" : "Not installed yet",
						icon: <AgentLogo id={agent.id} name={agent.name} />,
						badge: agent.available ? (
							<Badge tone="success" dot>
								Ready
							</Badge>
						) : (
							<Badge>Install</Badge>
						),
					}))}
				/>
			</Show>
			<div class="flex flex-col gap-2">
				<Button variant="primary" size="xl" disabled={!chosen()} onClick={finish} class="w-full">
					{chosen()
						? chosen()?.available
							? `Continue with ${chosen()?.name}`
							: `Install ${chosen()?.name}`
						: "Continue"}
				</Button>
				<Show when={loaded() && agents().length === 0}>
					<Text size="body" tone="subtle" class="md:text-center">
						No agents answered from this machine. Add one in Settings → Agents.
					</Text>
				</Show>
				<Quiet onClick={() => window.location.replace(workspacePath("/"))}>Skip for now</Quiet>
				<Quiet onClick={props.onBack}>Back</Quiet>
			</div>
		</div>
	);
}
