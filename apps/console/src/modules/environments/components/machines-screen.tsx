import { useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";

import {
	AgentLogo,
	Alert,
	Badge,
	BoltIcon,
	BranchIcon,
	Button,
	ClockIcon,
	Code,
	ConfirmDialog,
	Dialog,
	Field,
	GlobeIcon,
	iconButton,
	InfoIcon,
	Input,
	LaptopIcon,
	ListIcon,
	MachineCard,
	Menu,
	MoreIcon,
	notify,
	PlusIcon,
	Segmented,
	SettingsGroup,
	SettingsLinkRow,
	SettingsRow,
	ShieldIcon,
	Skeleton,
	Stack,
	Switch,
	TerminalIcon,
	Text,
} from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";
import { runnerUp } from "@/lib/runner-health";
import { useAuth } from "@/modules/auth";
import { offeredProviders, providersStore } from "@/modules/chat/stores/providers";
import { SettingsPage, settingsMenu } from "@/modules/settings/components/settings-page";
import { useShell } from "@/modules/shell";
import { useWorkspaces } from "@/modules/workspaces";
import { mayDo } from "@/modules/workspaces/lib/members";

import { type Environment, environmentsService } from "../services/environments.service";
import { machineService, type MachinePrefs, type MachineStatus } from "../services/machine.service";
import { environmentsStore } from "../stores/environments";

import { CodespacesPanel } from "./codespaces-panel";

/** While the page is open, how often this machine's numbers are read again. */
const REFRESH_MS = 5_000;

/** "36 GB", "212 GB": a size the way the card shows it. */
function gigabytes(bytes: number): string {
	const value = bytes / 1024 ** 3;
	return `${value >= 10 ? Math.round(value) : value.toFixed(1)} GB`;
}

/** "up 3 days", "up 4 hours", "up 12 minutes". */
function upFor(since: string): string {
	const minutes = Math.max(0, Math.round((Date.now() - Date.parse(since)) / 60_000));
	if (minutes < 60) return `up ${minutes} minute${minutes === 1 ? "" : "s"}`;
	const hours = Math.round(minutes / 60);
	if (hours < 48) return `up ${hours} hour${hours === 1 ? "" : "s"}`;
	return `up ${Math.round(hours / 24)} days`;
}

/** The last part of a path, as people say it: `~/Projects`. */
function homePath(path: string): string {
	return path.replace(/^\/(?:home|Users)\/[^/]+/, "~");
}

/**
 * Settings → Machines (Figma 24): computers where agents run your code, each through a small
 * runner. This machine — what it is, how hard it is working, what runs on it — then other
 * machines paired with this Grid (and Codespaces), and how this machine's runner behaves: start at
 * login, stay awake while agents work, how many agents at once, and the one folder they work in.
 */
export function MachinesScreen(): JSX.Element {
	const auth = useAuth();
	const shell = useShell();
	const navigate = useNavigate();
	const workspaces = useWorkspaces();
	const [status, setStatus] = createSignal<MachineStatus | null>(null);
	const [error, setError] = createSignal<string | null>(null);
	const [adding, setAdding] = createSignal(false);
	const [removing, setRemoving] = createSignal<Environment | null>(null);
	const [pending, setPending] = createSignal(false);
	// Changing this machine and the others is for roles that manage machines (Settings → Roles).
	const admin = () => {
		const current = workspaces.current();
		return current ? mayDo("machines", current.role, current.customRole, current.settings) : false;
	};

	async function read(token: string): Promise<void> {
		try {
			setStatus(await machineService.status(token));
			setError(null);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "This machine's runner did not answer");
		}
	}
	createEffect(
		() => auth.token(),
		(token) => {
			if (!token) return;
			void environmentsStore.load(token);
			void providersStore.load(token);
			void read(token);
			const timer = setInterval(() => void read(token), REFRESH_MS);
			return () => clearInterval(timer);
		},
	);
	onCleanup(() => setStatus(null));

	async function change(patch: Partial<MachinePrefs>): Promise<void> {
		const token = auth.token();
		const current = status();
		if (!token || !current) return;
		try {
			const prefs = await machineService.update(token, patch);
			setStatus({ ...current, prefs });
		} catch (cause) {
			notify({
				title: "Not changed",
				description: cause instanceof Error ? cause.message : "Try again",
			});
		}
	}

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

	const working = () =>
		offeredProviders(providersStore.providers()).filter((provider) => provider.available);
	const online = () => (runnerUp() ? 1 : 0);

	return (
		<SettingsPage
			title="Machines"
			description="Computers where agents run your code. Each one connects through a small runner."
			subtitle={`${online()} online`}
			menu={
				admin()
					? settingsMenu("Machines", [{ items: [{ id: "add", label: "Add machine" }] }], () =>
							setAdding(true),
						)
					: undefined
			}
		>
			<Show when={error()}>{(message) => <Alert tone="danger" title={message()} />}</Show>

			<Show
				when={status()}
				fallback={
					<Show when={!error()}>
						<Skeleton class="h-44" />
					</Show>
				}
			>
				{(current) => (
					<section class="flex flex-col gap-2 md:gap-3">
						<h2 class="font-medium text-body-lg text-fg max-md:hidden">This machine</h2>
						<MachineCard
							icon={<LaptopIcon />}
							name={current().info.hostname}
							status={
								<Show
									when={runnerUp()}
									fallback={
										<Badge tone="neutral" dot>
											Offline
										</Badge>
									}
								>
									<Badge tone="success" dot>
										Online
									</Badge>
								</Show>
							}
							meta={[
								current().info.system,
								shell.desktop() ? current().info.cpu.split(" @")[0] : null,
								gigabytes(current().info.memory.totalBytes),
								shell.desktop() ? `Runner ${current().info.runnerVersion}` : null,
								shell.desktop() ? upFor(current().info.startedAt) : null,
							]
								.filter(Boolean)
								.join(" · ")}
							stats={[
								{
									label: "CPU",
									value: `${current().info.cpuPercent}%`,
									percent: current().info.cpuPercent,
									tone: "accent",
								},
								{
									label: "Memory",
									value: `${Math.round(current().info.memory.usedBytes / 1024 ** 3)} of ${gigabytes(current().info.memory.totalBytes)}`,
									percent:
										(100 * current().info.memory.usedBytes) /
										Math.max(1, current().info.memory.totalBytes),
									tone: "violet",
								},
								{
									label: "Disk",
									value: `${gigabytes(current().info.disk.freeBytes)} free`,
									percent:
										100 -
										(100 * current().info.disk.freeBytes) /
											Math.max(1, current().info.disk.totalBytes),
									tone: "success",
								},
							]}
							footer={
								<>
									<For each={working().slice(0, 3)}>
										{(agent) => <AgentLogo id={agent.id} name={agent.name} />}
									</For>
									<span class="truncate">
										{current().agentsRunning} agent{current().agentsRunning === 1 ? "" : "s"}{" "}
										{shell.desktop() ? "running" : ""} · {current().terminals} terminal
										{current().terminals === 1 ? "" : "s"}
									</span>
								</>
							}
							action={
								<Button
									size="sm"
									variant="ghost"
									icon={<TerminalIcon size="sm" />}
									onClick={() => navigate(workspaceHref("/terminal"))}
								>
									Open terminals
								</Button>
							}
						/>
					</section>
				)}
			</Show>

			<SettingsGroup
				title="Other machines"
				action={
					<Show when={admin() && shell.desktop()}>
						<Button size="sm" icon={<PlusIcon size="sm" />} onClick={() => setAdding(true)}>
							Add machine
						</Button>
					</Show>
				}
			>
				<Show
					when={environmentsStore.environments().length > 0}
					fallback={
						<SettingsRow
							inline
							label="None yet"
							description="Pair a VPS, another laptop or a Codespace running Grid"
						/>
					}
				>
					<For each={environmentsStore.environments()}>
						{(environment) => (
							<EnvironmentRow
								environment={environment}
								admin={admin()}
								onRemove={() => setRemoving(environment)}
							/>
						)}
					</For>
				</Show>
			</SettingsGroup>

			<CodespacesPanel />

			<Show when={status()}>
				{(current) => (
					<SettingsGroup
						title="Runner"
						description={shell.desktop() ? `Applies to ${current().info.hostname}` : undefined}
					>
						<SettingsRow inline leading={<BoltIcon />} label="Start when I log in">
							<Switch
								label="Start when I log in"
								checked={current().prefs.startAtLogin}
								disabled={!admin()}
								onChange={(startAtLogin) => void change({ startAtLogin })}
							/>
						</SettingsRow>
						<SettingsRow
							inline
							leading={<ClockIcon />}
							label="Keep awake while agents work"
							description={
								shell.desktop() ? "Lets long tasks finish while you are away" : undefined
							}
						>
							<Switch
								label="Keep awake while agents work"
								checked={current().prefs.keepAwake}
								disabled={!admin()}
								onChange={(keepAwake) => void change({ keepAwake })}
							/>
						</SettingsRow>
						<Show when={shell.desktop()}>
							<SettingsRow
								inline
								leading={<ListIcon />}
								label="Agents at the same time"
								description="More agents use more memory; the rest wait their turn"
							>
								<Segmented<string>
									label="Agents at the same time"
									size="sm"
									value={String(current().prefs.concurrency)}
									onChange={(value) => {
										if (admin()) void change({ concurrency: Number(value) });
									}}
									options={[
										{ value: "1", label: "1" },
										{ value: "2", label: "2" },
										{ value: "4", label: "4" },
									]}
								/>
							</SettingsRow>
						</Show>
						<SettingsRow
							inline
							leading={<ShieldIcon />}
							label={`Only work inside ${homePath(current().projectsDir)}`}
							description={
								shell.desktop() ? "Agents can't read or write outside this folder" : undefined
							}
						>
							<Switch
								label={`Only work inside ${homePath(current().projectsDir)}`}
								checked={true}
								disabled={true}
								onChange={() => {}}
							/>
						</SettingsRow>
					</SettingsGroup>
				)}
			</Show>

			<SettingsGroup title="More">
				<SettingsLinkRow
					leading={<BranchIcon />}
					label="Worktrees"
					description="Separate checkouts threads work in"
					onClick={() => navigate(workspaceHref("/settings/worktrees"))}
				/>
				<SettingsLinkRow
					leading={<InfoIcon />}
					label="Diagnostics"
					description="Runner errors and connection events"
					onClick={() => navigate(workspaceHref("/settings/diagnostics"))}
				/>
			</SettingsGroup>

			<AddMachineDialog open={adding()} onClose={() => setAdding(false)} />
			<ConfirmDialog
				open={removing() !== null}
				title={`Remove ${removing()?.label ?? "this machine"}?`}
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

/** A paired machine: its name and address, whether it answers, and removing it. */
function EnvironmentRow(props: {
	environment: Environment;
	admin: boolean;
	onRemove: () => void;
}): JSX.Element {
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
	const host = () => {
		try {
			return new URL(props.environment.url).host;
		} catch {
			return props.environment.url;
		}
	};

	return (
		<SettingsRow
			inline
			leading={<GlobeIcon />}
			label={props.environment.label}
			description={host()}
		>
			<Show
				when={reachable() !== null}
				fallback={
					<Text size="caption" tone="subtle">
						Checking
					</Text>
				}
			>
				<Show
					when={reachable()}
					fallback={
						<Badge tone="neutral" dot>
							Offline
						</Badge>
					}
				>
					<Badge tone="success" dot>
						Online
					</Badge>
				</Show>
			</Show>
			<Show when={props.admin}>
				<Menu
					label={`Actions for ${props.environment.label}`}
					trigger={<MoreIcon />}
					triggerClass={iconButton({ size: "sm" })}
					placement="bottom-end"
					groups={[{ items: [{ id: "remove", label: "Remove machine", danger: true }] }]}
					onSelect={() => props.onRemove()}
				/>
			</Show>
		</SettingsRow>
	);
}

/** Pair a machine by its address and the one-time code it prints. */
function AddMachineDialog(props: { open: boolean; onClose: () => void }): JSX.Element {
	const auth = useAuth();
	const [url, setUrl] = createSignal("");
	const [code, setCode] = createSignal("");
	const [label, setLabel] = createSignal("");
	const [busy, setBusy] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);

	const close = () => {
		setError(null);
		props.onClose();
	};
	async function submit(): Promise<void> {
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
			close();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not pair");
		} finally {
			setBusy(false);
		}
	}

	return (
		<Dialog
			open={props.open}
			onClose={close}
			title="Add a machine"
			description="A VPS, another laptop, or a Codespace running Grid."
			footer={
				<>
					<Button onClick={close}>Cancel</Button>
					<Button
						variant="primary"
						disabled={busy() || !url().trim() || !code().trim()}
						onClick={() => void submit()}
					>
						{busy() ? "Pairing…" : "Pair"}
					</Button>
				</>
			}
		>
			<Stack gap={4}>
				<Text tone="subtle">
					On it, run <Code>bun run grid:pair</Code>. It prints the address and a code that works
					once, for ten minutes. A Codespace joins your tailnet when it has a{" "}
					<Code>TS_AUTH_KEY</Code> secret.
				</Text>
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
				<Show when={error()}>{(message) => <Alert tone="danger" title={message()} />}</Show>
			</Stack>
		</Dialog>
	);
}
