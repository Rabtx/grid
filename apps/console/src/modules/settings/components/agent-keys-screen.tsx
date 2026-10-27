import type { JSX } from "@solidjs/web";
import { createSignal, For, onSettled, Show } from "solid-js";

import {
	Alert,
	Badge,
	Button,
	ConfirmDialog,
	CopyLine,
	Dialog,
	EmptyState,
	Field,
	Input,
	KeyIcon,
	Select,
	SettingsGroup,
	SettingsRow,
	Skeleton,
	Stack,
	Switch,
	Text,
} from "@/kit";
import { runnerCall } from "@/lib/runner-client";
import { useAuth } from "@/modules/auth";
import { offeredProviders, providersStore } from "@/modules/chat/stores/providers";
import { relativeTime } from "@/modules/projects/lib/relative-time";
import { useWorkspace } from "@/modules/projects";

import { keyLimits } from "../lib/key-limits";
import { SettingsPage } from "./settings-page";

/** A key an agent outside Grid signs in to Grid's MCP endpoint with; its token is never listed. */
export type AgentKey = {
	id: string;
	name: string;
	prefix: string;
	write: boolean;
	mode: string;
	project: string | null;
	provider: string | null;
	createdAt: string;
	lastUsedAt: string | null;
	/** When it stops working (ISO); null for never. */
	expiresAt: string | null;
	/** The only projects it may work in; empty for any. */
	projects: string[];
	/** Most its threads may cost in 30 days; null for no cap. */
	budgetUsd: number | null;
	/** Sees only the threads it started. */
	ownThreads: boolean;
	/** What its threads cost in the last 30 days. */
	spentUsd: number;
};

type NewKey = {
	name: string;
	write: boolean;
	mode: string;
	project: string;
	provider: string;
	/** Days until it stops working; 0 for never. */
	days: number;
	projects: string[];
	/** A 30-day budget in dollars, as typed; empty for none. */
	budget: string;
	ownThreads: boolean;
};

const LIFETIMES = [
	{ value: "0", label: "Never expires" },
	{ value: "7", label: "7 days" },
	{ value: "30", label: "30 days" },
	{ value: "90", label: "90 days" },
	{ value: "365", label: "A year" },
] as const;

const MODES = [
	{ value: "plan", label: "Plan only" },
	{ value: "default", label: "Ask before changes" },
	{ value: "acceptEdits", label: "Accept edits" },
	{ value: "bypassPermissions", label: "Full access" },
] as const;

const BLANK: NewKey = {
	name: "",
	write: false,
	mode: "default",
	project: "",
	provider: "",
	days: 0,
	projects: [],
	budget: "",
	ownThreads: false,
};

/** The address agents outside Grid reach it at: the runner, through this console. */
export function mcpUrl(origin: string = window.location.origin): string {
	return `${origin}/runner/mcp`;
}

/**
 * Settings → Agent keys: keys for agents outside Grid (Claude Desktop, Cursor, a script) to use
 * Grid's MCP endpoint as you: list projects and threads, read them, and (a key that may write)
 * start threads, send to them and answer their questions. What they start is marked as theirs.
 */
export function AgentKeysScreen(): JSX.Element {
	const auth = useAuth();
	const workspace = useWorkspace();
	const [keys, setKeys] = createSignal<AgentKey[] | null>(null);
	const [error, setError] = createSignal<string | null>(null);
	const [making, setMaking] = createSignal<NewKey | null>(null);
	const [made, setMade] = createSignal<{ name: string; token: string } | null>(null);
	const [revoking, setRevoking] = createSignal<AgentKey | null>(null);
	const [busy, setBusy] = createSignal(false);

	async function load(): Promise<void> {
		const token = auth.token();
		if (!token) return;
		try {
			setKeys(await runnerCall<AgentKey[]>("/chat/agent-keys", token));
			setError(null);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not read your keys");
			setKeys([]);
		}
	}

	onSettled(() => {
		void load();
		const token = auth.token();
		if (token) void providersStore.load(token);
	});

	async function create(): Promise<void> {
		const token = auth.token();
		const input = making();
		if (!token || !input) return;
		setBusy(true);
		try {
			const result = await runnerCall<{ key: AgentKey; token: string }>("/chat/agent-keys", token, {
				method: "POST",
				body: JSON.stringify({
					name: input.name.trim(),
					write: input.write,
					mode: input.mode,
					project: input.project || null,
					provider: input.provider || null,
					...(input.days ? { expiresInDays: input.days } : {}),
					projects: input.projects,
					...(input.budget.trim() ? { budgetUsd: Number(input.budget) } : {}),
					ownThreads: input.ownThreads,
				}),
			});
			setMaking(null);
			setMade({ name: result.key.name, token: result.token });
			await load();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not make the key");
		} finally {
			setBusy(false);
		}
	}

	async function revoke(): Promise<void> {
		const token = auth.token();
		const key = revoking();
		if (!token || !key) return;
		setBusy(true);
		try {
			await runnerCall<void>(`/chat/agent-keys/${key.id}`, token, { method: "DELETE" });
			setRevoking(null);
			await load();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not revoke the key");
		} finally {
			setBusy(false);
		}
	}

	const change = (next: Partial<NewKey>) =>
		setMaking((current) => (current ? { ...current, ...next } : current));
	const projectName = (slug: string) =>
		workspace.projects().find((project) => project.slug === slug)?.name ?? slug;
	const agents = () => offeredProviders(providersStore.providers());

	return (
		<SettingsPage
			title="Agent keys"
			description="Agents outside Grid (Claude Desktop, Cursor, your scripts) use Grid over MCP with a key: they see your threads and, if the key allows, start and steer them."
			actions={
				<Button size="sm" onClick={() => setMaking({ ...BLANK })}>
					New key
				</Button>
			}
		>
			<Show when={error()}>{(message) => <Alert tone="danger" title={message()} />}</Show>
			<SettingsGroup title="Grid's MCP endpoint">
				<SettingsRow
					label="Address"
					description="Streamable HTTP. Send the key as a bearer token: Authorization: Bearer grid_ak_…"
				>
					<div class="w-full md:w-80">
						<CopyLine label="MCP address" value={mcpUrl()} />
					</div>
				</SettingsRow>
			</SettingsGroup>
			<Show
				when={keys()}
				fallback={
					<Stack gap={2}>
						<Skeleton class="h-14" />
						<Skeleton class="h-14" />
					</Stack>
				}
			>
				{(loaded) => (
					<Show
						when={loaded().length > 0}
						fallback={
							<EmptyState
								icon={<KeyIcon size="md" />}
								title="No keys yet"
								description="Make one for each agent, so you can see what each did and revoke one alone."
							/>
						}
					>
						<SettingsGroup title="Your keys">
							<For each={loaded()}>
								{(key) => (
									<SettingsRow
										label={key.name}
										description={[
											`${key.prefix}…`,
											key.projects.length
												? `only ${key.projects.map(projectName).join(", ")}`
												: key.project
													? projectName(key.project)
													: "Any project",
											...keyLimits(key),
											key.lastUsedAt ? `used ${relativeTime(key.lastUsedAt)}` : "never used",
										].join(" · ")}
									>
										<Badge tone={key.write ? "warning" : "neutral"}>
											{key.write ? "Can start threads" : "Read only"}
										</Badge>
										<Button size="sm" variant="ghost" onClick={() => setRevoking(key)}>
											Revoke
										</Button>
									</SettingsRow>
								)}
							</For>
						</SettingsGroup>
					</Show>
				)}
			</Show>

			<Dialog
				open={making() !== null}
				onClose={() => setMaking(null)}
				title="New agent key"
				width="30rem"
				onSubmit={() => void create()}
				footer={
					<>
						<Button variant="ghost" onClick={() => setMaking(null)}>
							Cancel
						</Button>
						<Button disabled={busy() || !making()?.name.trim()} onClick={() => void create()}>
							Make key
						</Button>
					</>
				}
			>
				<Show when={making()}>
					{(form) => (
						<Stack gap={3}>
							<Field
								label="Name"
								hint="The agent that will use it; its threads are marked with this."
							>
								{(id) => (
									<Input
										id={id}
										autofocus
										maxlength={60}
										placeholder="Claude Desktop"
										value={form().name}
										onInput={(event) => change({ name: event.currentTarget.value })}
									/>
								)}
							</Field>
							<Field label="Project" hint="Where its threads start unless it names another.">
								{() => (
									<Select
										label="Project"
										look="field"
										value={form().project}
										onChange={(project) => change({ project })}
										groups={[
											{
												options: [
													{ value: "", label: "Any project" },
													...workspace.projects().map((project) => ({
														value: project.slug,
														label: project.name,
													})),
												],
											},
										]}
									/>
								)}
							</Field>
							<Field label="Agent" hint="Which agent its threads run unless it names another.">
								{() => (
									<Select
										label="Agent"
										look="field"
										value={form().provider}
										onChange={(provider) => change({ provider })}
										groups={[
											{
												options: [
													{ value: "", label: "It says each time" },
													...agents().map((agent) => ({ value: agent.id, label: agent.name })),
												],
											},
										]}
									/>
								)}
							</Field>
							<Field
								label="Mode"
								hint="The most its threads may do; it can ask for less, never more."
							>
								{() => (
									<Select
										label="Mode"
										look="field"
										value={form().mode}
										onChange={(mode) => change({ mode })}
										groups={[{ options: [...MODES] }]}
									/>
								)}
							</Field>
							<SettingsRow
								inline
								label="Can start and steer threads"
								description="Off: it can only read your threads."
							>
								<Switch
									label="Can start and steer threads"
									checked={form().write}
									onChange={(write) => change({ write })}
								/>
							</SettingsRow>
							<Field label="Expires">
								{() => (
									<Select
										label="Expires"
										look="field"
										value={String(form().days)}
										onChange={(days) => change({ days: Number(days) })}
										groups={[{ options: [...LIFETIMES] }]}
									/>
								)}
							</Field>
							<Field
								label="Budget for 30 days (USD)"
								hint="It starts no more work once its threads have cost this. Empty: no cap of its own."
							>
								{(id) => (
									<Input
										id={id}
										type="number"
										min="0.01"
										step="0.01"
										inputmode="decimal"
										placeholder="No cap"
										value={form().budget}
										onInput={(event) => change({ budget: event.currentTarget.value })}
									/>
								)}
							</Field>
							<SettingsRow
								inline
								label="Only threads it starts"
								description="Off: it sees all your threads."
							>
								<Switch
									label="Only threads it starts"
									checked={form().ownThreads}
									onChange={(ownThreads) => change({ ownThreads })}
								/>
							</SettingsRow>
							<Show when={workspace.projects().length > 1}>
								<Stack gap={1}>
									<Text size="caption" tone="subtle">
										Projects it may work in (none chosen: any)
									</Text>
									<For each={workspace.projects()}>
										{(project) => (
											<SettingsRow inline label={project.name}>
												<Switch
													label={`May work in ${project.name}`}
													checked={form().projects.includes(project.slug)}
													onChange={(on) =>
														change({
															projects: on
																? [...form().projects, project.slug]
																: form().projects.filter((slug) => slug !== project.slug),
														})
													}
												/>
											</SettingsRow>
										)}
									</For>
								</Stack>
							</Show>
						</Stack>
					)}
				</Show>
			</Dialog>

			<Dialog
				open={made() !== null}
				onClose={() => setMade(null)}
				title={`Key for ${made()?.name ?? "your agent"}`}
				description="Copy it now: Grid keeps only a hash and cannot show it again."
				width="34rem"
				footer={<Button onClick={() => setMade(null)}>Done</Button>}
			>
				<Show when={made()}>
					{(key) => (
						<Stack gap={2}>
							<CopyLine label="agent key" value={key().token} secret />
							<Text size="caption" tone="subtle">
								In Claude Code: claude mcp add --transport http grid {mcpUrl()} --header
								"Authorization: Bearer &lt;this key&gt;"
							</Text>
						</Stack>
					)}
				</Show>
			</Dialog>

			<ConfirmDialog
				open={revoking() !== null}
				onClose={() => setRevoking(null)}
				onConfirm={() => void revoke()}
				title={`Revoke “${revoking()?.name ?? "this key"}”?`}
				description="The agent using it is signed out at once. Threads it started stay."
				confirm="Revoke"
				danger
				stayOpen
				pending={busy()}
			/>
		</SettingsPage>
	);
}
