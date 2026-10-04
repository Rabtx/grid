import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, Show } from "solid-js";

import {
	AgentLogo,
	Alert,
	Badge,
	Button,
	CopyIcon,
	Dialog,
	Field,
	IdentityCard,
	IconButton,
	Input,
	LinkButton,
	MonoValue,
	notify,
	PillInput,
	Select,
	SettingsGroup,
	SettingsLinkRow,
	SettingsRow,
	Skeleton,
	Spinner,
	Stack,
	Text,
	WorkspaceMark,
} from "@/kit";
import { useAuth } from "@/modules/auth";
import { offeredProviders, providersStore } from "@/modules/chat/stores/providers";
import { useShell } from "@/modules/shell";
import { useWorkspaces } from "@/modules/workspaces";
import { isAdmin, memberName, ROLE_LABEL } from "@/modules/workspaces/lib/members";
import { workspacesService } from "@/modules/workspaces/services/workspaces.service";
import type {
	DataStatus,
	Member,
	WorkspaceSettings,
} from "@/modules/workspaces/types/workspace.types";

import { ago } from "../lib/devices";

import { SettingsPage, settingsMenu } from "./settings-page";

const BRANCHES = ["main", "master", "develop", "trunk"];
const WEEK = [
	{ value: "monday", label: "Monday" },
	{ value: "sunday", label: "Sunday" },
	{ value: "saturday", label: "Saturday" },
] as const;
const RETENTION = [
	{ value: "30", label: "30 days" },
	{ value: "90", label: "90 days" },
	{ value: "180", label: "180 days" },
	{ value: "365", label: "1 year" },
	{ value: "0", label: "Forever" },
];

/** "2.4 GB", "312 MB": a size as people read it. */
function size(bytes: number): string {
	const units = ["B", "KB", "MB", "GB", "TB"];
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** "3:00 AM" for an hour of the day. */
function clockHour(hour: number): string {
	return `${hour % 12 === 0 ? 12 : hour % 12}:00 ${hour < 12 ? "AM" : "PM"}`;
}

function reason(cause: unknown): string {
	return cause instanceof Error ? cause.message : "Try again";
}

/**
 * Settings → General (Figma 24): the basics for the workspace and where its data lives — its logo
 * and name, the address teammates open, the branch and agent new work starts with, the first day
 * of the week; the database, its backups, how long run logs are kept and an export; and handing
 * the workspace over or deleting it. Admins change these; everyone sees them.
 */
export function GeneralScreen(): JSX.Element {
	const auth = useAuth();
	const shell = useShell();
	const workspaces = useWorkspaces();
	const [data, setData] = createSignal<DataStatus | null>(null);
	const [dataError, setDataError] = createSignal<string | null>(null);
	const [backingUp, setBackingUp] = createSignal(false);
	const [sheet, setSheet] = createSignal<"edit" | "backups" | "transfer" | "delete" | null>(null);
	let logo: HTMLInputElement | undefined;

	const current = () => workspaces.current();
	const slug = () => current()?.slug ?? null;
	const role = () => current()?.role ?? "member";
	const admin = () => isAdmin(role());
	const owner = () => role() === "owner";
	const settings = (): WorkspaceSettings => current()?.settings ?? {};
	const address = () => location.host;
	const agents = () => offeredProviders(providersStore.providers());

	createEffect(
		() => [auth.token(), slug(), admin()] as const,
		([token, ws, canSee]) => {
			if (!token) return;
			void providersStore.load(token);
			if (!ws || !canSee) return;
			workspacesService.data(token, ws).then(
				(status) => {
					setData(status);
					setDataError(null);
				},
				(cause) => setDataError(reason(cause)),
			);
		},
	);

	async function save(
		patch: { name?: string; settings?: Partial<WorkspaceSettings> },
		what: string,
	): Promise<void> {
		const token = auth.token(),
			ws = slug();
		if (!token || !ws) return;
		try {
			await workspacesService.update(token, ws, patch);
			workspaces.refresh();
		} catch (cause) {
			notify({ title: `${what} was not saved`, description: reason(cause) });
		}
	}

	async function uploadLogo(file: File): Promise<void> {
		const token = auth.token(),
			ws = slug();
		if (!token || !ws) return;
		try {
			await workspacesService.uploadLogo(token, ws, file);
			workspaces.refresh();
			notify({ title: "Logo changed" });
		} catch (cause) {
			notify({ title: "Logo not changed", description: reason(cause) });
		}
	}

	async function backUp(): Promise<void> {
		const token = auth.token(),
			ws = slug();
		if (!token || !ws || backingUp()) return;
		setBackingUp(true);
		try {
			const made = await workspacesService.backUp(token, ws);
			notify({ title: "Backed up", description: `${made.file} · ${size(made.sizeBytes)}` });
			setData(await workspacesService.data(token, ws));
		} catch (cause) {
			notify({ title: "Not backed up", description: reason(cause) });
		} finally {
			setBackingUp(false);
		}
	}

	async function exportIt(): Promise<void> {
		const token = auth.token(),
			ws = slug();
		if (!token || !ws) return;
		try {
			await workspacesService.exportFile(token, ws);
		} catch (cause) {
			notify({ title: "Not exported", description: reason(cause) });
		}
	}

	const backupLine = () => {
		const status = data();
		if (!status) return "Checking…";
		if (!status.backups.available) return "pg_dump is not installed on this machine";
		const last = status.backups.last;
		return `Nightly at ${clockHour(status.backups.hour)} · ${last ? `last one ${ago(last.at)}` : "none yet"}`;
	};
	const databaseLine = () => {
		const status = data();
		return status
			? `${status.database.version} · ${size(status.database.sizeBytes)} on ${status.host}`
			: "Checking…";
	};
	const look = () => (shell.desktop() ? "pill" : "value");
	const retention = () => String(settings().logRetentionDays ?? 0);
	const branch = () => settings().defaultBranch ?? "main";
	const branches = () => (BRANCHES.includes(branch()) ? BRANCHES : [...BRANCHES, branch()]);
	const agentOptions = () =>
		agents().map((agent) => ({
			value: agent.id,
			label: agent.name,
			icon: <AgentLogo id={agent.id} name={agent.name} />,
		}));
	const defaultAgent = () => settings().defaultAgent ?? agents()[0]?.id ?? "";

	const healthy = () => (
		<Show when={data()} fallback={<Spinner label="Checking" />}>
			{(status) => (
				<Show when={status().database.healthy} fallback={<Badge tone="danger">Unreachable</Badge>}>
					<Badge tone="success" dot>
						Healthy
					</Badge>
				</Show>
			)}
		</Show>
	);

	const workspaceRows = () => (
		<>
			<SettingsRow
				inline
				label="Default branch"
				description={shell.desktop() ? "New tasks branch from here" : undefined}
			>
				<Select
					look={look()}
					label="Default branch"
					value={branch()}
					disabled={!admin()}
					onChange={(defaultBranch) => void save({ settings: { defaultBranch } }, "The branch")}
					groups={[{ options: branches().map((value) => ({ value, label: value })) }]}
				/>
			</SettingsRow>
			<SettingsRow
				inline
				label="Default agent"
				description={shell.desktop() ? "Used when a task doesn't pick one" : undefined}
			>
				<Show when={agentOptions().length} fallback={<Text tone="subtle">None installed</Text>}>
					<Select
						look={look()}
						label="Default agent"
						value={defaultAgent()}
						disabled={!admin()}
						onChange={(defaultAgent) => void save({ settings: { defaultAgent } }, "The agent")}
						groups={[{ options: agentOptions() }]}
					/>
				</Show>
			</SettingsRow>
			<SettingsRow
				inline
				label="Week starts on"
				description={shell.desktop() ? "Board, automations and reports" : undefined}
			>
				<Select
					look={look()}
					label="Week starts on"
					value={settings().weekStartsOn ?? "monday"}
					disabled={!admin()}
					onChange={(weekStartsOn) => void save({ settings: { weekStartsOn } }, "The week")}
					groups={[{ options: WEEK }]}
				/>
			</SettingsRow>
		</>
	);

	return (
		<SettingsPage
			title="General"
			description={`The basics for the ${current()?.name ?? "workspace"} workspace and where its data lives.`}
			subtitle={current() ? `${current()?.name} workspace` : undefined}
			menu={
				admin()
					? settingsMenu(
							"General",
							[{ items: [{ id: "export", label: "Export workspace" }] }],
							() => void exportIt(),
						)
					: undefined
			}
		>
			<Show when={current()} fallback={<Skeleton class="h-40" />}>
				{(workspace) => (
					<>
						<IdentityCard
							mark={
								<WorkspaceMark
									name={workspace().name}
									color={workspace().color}
									src={workspace().logoUrl}
									size="xl"
								/>
							}
							name={workspace().name}
							meta={
								shell.desktop() && data()
									? `${address()} · self-hosted on ${data()?.host}`
									: address()
							}
							action={
								<Show when={admin()}>
									<Show
										when={shell.desktop()}
										fallback={
											<LinkButton tone="accent" onClick={() => setSheet("edit")}>
												Edit
											</LinkButton>
										}
									>
										<Button size="sm" onClick={() => logo?.click()}>
											Change logo
										</Button>
									</Show>
								</Show>
							}
						/>

						<Show
							when={shell.desktop()}
							fallback={<SettingsGroup title="Workspace">{workspaceRows()}</SettingsGroup>}
						>
							<SettingsGroup
								title="Workspace"
								description={`Applies to everyone in ${workspace().name}.`}
							>
								<SettingsRow label="Name">
									<PillInput
										aria-label="Workspace name"
										maxlength={120}
										value={workspace().name}
										disabled={!admin()}
										onChange={(event) => {
											const name = event.currentTarget.value.trim();
											if (name && name !== workspace().name) void save({ name }, "The name");
										}}
									/>
								</SettingsRow>
								<SettingsRow inline label="Address" description="Where teammates open Grid">
									<MonoValue>{address()}</MonoValue>
									<IconButton
										size="sm"
										label="Copy address"
										onClick={() => {
											void navigator.clipboard?.writeText(location.origin);
											notify({ title: "Address copied" });
										}}
									>
										<CopyIcon />
									</IconButton>
								</SettingsRow>
								{workspaceRows()}
							</SettingsGroup>
						</Show>

						<Show when={admin()}>
							<SettingsGroup
								title="Data"
								description="Everything lives on your machine. Nothing leaves unless you send it."
							>
								<Show when={dataError()}>
									{(message) => (
										<div class="p-3">
											<Alert tone="danger" title={message()} />
										</div>
									)}
								</Show>
								<SettingsRow
									inline
									label="Database"
									description={shell.desktop() ? databaseLine() : undefined}
								>
									{healthy()}
								</SettingsRow>
								<Show
									when={shell.desktop()}
									fallback={
										<SettingsLinkRow
											label="Backups"
											value={data()?.backups.available ? "Nightly" : "Off"}
											onClick={() => setSheet("backups")}
										/>
									}
								>
									<SettingsRow inline label="Backups" description={backupLine()}>
										<Show when={data()?.backups.available}>
											<Button size="sm" disabled={backingUp()} onClick={() => void backUp()}>
												<Show when={backingUp()} fallback="Back up now">
													<Spinner label="Backing up" />
												</Show>
											</Button>
										</Show>
									</SettingsRow>
								</Show>
								<SettingsRow
									inline
									label="Keep run logs"
									description={
										shell.desktop()
											? "Agent transcripts, terminal output and screenshots"
											: undefined
									}
								>
									<Select
										look={look()}
										label="Keep run logs"
										value={retention()}
										onChange={(value) =>
											void save({ settings: { logRetentionDays: Number(value) } }, "Run logs")
										}
										groups={[{ options: RETENTION }]}
									/>
								</SettingsRow>
								<Show
									when={shell.desktop()}
									fallback={
										<SettingsLinkRow label="Export workspace" onClick={() => void exportIt()} />
									}
								>
									<SettingsRow
										inline
										label="Export workspace"
										description="Notes, tasks and projects as JSON"
									>
										<Button size="sm" onClick={() => void exportIt()}>
											Export
										</Button>
									</SettingsRow>
								</Show>
							</SettingsGroup>
						</Show>

						<Show when={owner()}>
							<SettingsGroup title="Danger zone">
								<Show
									when={shell.desktop()}
									fallback={
										<>
											<SettingsLinkRow
												label="Transfer ownership"
												onClick={() => setSheet("transfer")}
											/>
											<SettingsLinkRow
												label="Delete workspace"
												onClick={() => setSheet("delete")}
											/>
										</>
									}
								>
									<SettingsRow
										inline
										label="Transfer ownership"
										description={`Make another admin the owner of ${workspace().name}`}
									>
										<Button size="sm" onClick={() => setSheet("transfer")}>
											Transfer
										</Button>
									</SettingsRow>
									<SettingsRow
										inline
										danger
										label="Delete workspace"
										description="Removes projects, notes and tasks from Grid. Repos stay untouched."
									>
										<Button size="sm" variant="danger" onClick={() => setSheet("delete")}>
											Delete workspace
										</Button>
									</SettingsRow>
								</Show>
							</SettingsGroup>
						</Show>

						<input
							ref={(element) => {
								logo = element;
							}}
							type="file"
							accept="image/png,image/jpeg,image/webp,image/svg+xml"
							class="sr-only"
							aria-label="Choose a logo"
							onChange={(event) => {
								const file = event.currentTarget.files?.[0];
								if (file) void uploadLogo(file);
								event.currentTarget.value = "";
							}}
						/>
						<EditSheet
							open={sheet() === "edit"}
							name={workspace().name}
							onClose={() => setSheet(null)}
							onLogo={() => logo?.click()}
							onSave={(name) => void save({ name }, "The name")}
						/>
						<BackupsSheet
							open={sheet() === "backups"}
							line={backupLine()}
							available={Boolean(data()?.backups.available)}
							busy={backingUp()}
							onClose={() => setSheet(null)}
							onBackUp={() => void backUp()}
						/>
						<TransferSheet open={sheet() === "transfer"} onClose={() => setSheet(null)} />
						<DeleteSheet
							open={sheet() === "delete"}
							name={workspace().name}
							onClose={() => setSheet(null)}
						/>
					</>
				)}
			</Show>
		</SettingsPage>
	);
}

/** Phones: the workspace's name and logo. */
function EditSheet(props: {
	open: boolean;
	name: string;
	onClose: () => void;
	onLogo: () => void;
	onSave: (name: string) => void;
}): JSX.Element {
	const [name, setName] = createSignal("");
	createEffect(
		() => [props.open, props.name] as const,
		([open, value]) => {
			if (open) setName(value);
		},
	);
	return (
		<Dialog
			open={props.open}
			onClose={props.onClose}
			title="Edit workspace"
			footer={
				<>
					<Button onClick={props.onClose}>Cancel</Button>
					<Button
						variant="primary"
						disabled={!name().trim()}
						onClick={() => {
							props.onSave(name().trim());
							props.onClose();
						}}
					>
						Save
					</Button>
				</>
			}
		>
			<Stack gap={4}>
				<Field label="Name">
					{(id) => (
						<Input
							id={id}
							maxlength={120}
							value={name()}
							onInput={(event) => setName(event.currentTarget.value)}
						/>
					)}
				</Field>
				<Button onClick={props.onLogo}>Change logo</Button>
			</Stack>
		</Dialog>
	);
}

/** Phones: when backups run, the last one, and backing up now. */
function BackupsSheet(props: {
	open: boolean;
	line: string;
	available: boolean;
	busy: boolean;
	onClose: () => void;
	onBackUp: () => void;
}): JSX.Element {
	return (
		<Dialog open={props.open} onClose={props.onClose} title="Backups" description={props.line}>
			<Show when={props.available}>
				<Button variant="primary" disabled={props.busy} onClick={props.onBackUp}>
					<Show when={props.busy} fallback="Back up now">
						<Spinner label="Backing up" />
					</Show>
				</Button>
			</Show>
		</Dialog>
	);
}

/** Making someone else the owner; you stay on as an admin. */
function TransferSheet(props: { open: boolean; onClose: () => void }): JSX.Element {
	const auth = useAuth();
	const workspaces = useWorkspaces();
	const [members, setMembers] = createSignal<Member[]>([]);
	const [picked, setPicked] = createSignal<string>("");
	const [busy, setBusy] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);
	const others = () => members().filter((member) => member.userId !== auth.user()?.id);

	createEffect(
		() => props.open,
		(open) => {
			const token = auth.token(),
				ws = workspaces.current()?.slug;
			if (!open || !token || !ws) return;
			setError(null);
			workspacesService.members(token, ws).then(
				(list) => {
					setMembers(list);
					const first = list.find((member) => member.userId !== auth.user()?.id);
					setPicked(first?.userId ?? "");
				},
				(cause) => setError(reason(cause)),
			);
		},
	);

	async function transfer(): Promise<void> {
		const token = auth.token(),
			ws = workspaces.current()?.slug,
			me = auth.user()?.id;
		if (!token || !ws || !me || !picked() || busy()) return;
		setBusy(true);
		setError(null);
		try {
			await workspacesService.setRole(token, ws, picked(), { role: "owner", customRole: null });
			await workspacesService.setRole(token, ws, me, { role: "admin", customRole: null });
			workspaces.refresh();
			notify({ title: "Ownership transferred", description: "You are an admin now." });
			props.onClose();
		} catch (cause) {
			setError(reason(cause));
		} finally {
			setBusy(false);
		}
	}

	return (
		<Dialog
			open={props.open}
			onClose={props.onClose}
			title="Transfer ownership"
			description="They get billing, the address and deleting the workspace. You stay on as an admin."
			footer={
				<>
					<Button onClick={props.onClose}>Cancel</Button>
					<Button variant="primary" disabled={busy() || !picked()} onClick={() => void transfer()}>
						Transfer
					</Button>
				</>
			}
		>
			<Stack gap={3}>
				<Show when={error()}>{(message) => <Alert tone="danger" title={message()} />}</Show>
				<Show
					when={others().length}
					fallback={<Text tone="subtle">Invite someone first: there is nobody else here yet.</Text>}
				>
					<Field label="New owner">
						{() => (
							<Select
								look="field"
								label="New owner"
								value={picked()}
								onChange={setPicked}
								groups={[
									{
										options: others().map((member) => ({
											value: member.userId,
											label: `${memberName(member)} · ${ROLE_LABEL[member.role]}`,
										})),
									},
								]}
							/>
						)}
					</Field>
				</Show>
			</Stack>
		</Dialog>
	);
}

/** Deleting the workspace, once its name is typed. */
function DeleteSheet(props: { open: boolean; name: string; onClose: () => void }): JSX.Element {
	const auth = useAuth();
	const workspaces = useWorkspaces();
	const [typed, setTyped] = createSignal("");
	const [busy, setBusy] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);
	async function remove(): Promise<void> {
		const token = auth.token(),
			ws = workspaces.current()?.slug;
		if (!token || !ws || busy()) return;
		setBusy(true);
		try {
			await workspacesService.remove(token, ws);
			location.assign("/");
		} catch (cause) {
			setError(reason(cause));
			setBusy(false);
		}
	}
	return (
		<Dialog
			open={props.open}
			onClose={props.onClose}
			title={`Delete ${props.name}?`}
			description="Its projects, tasks and notes go for everyone. Folders and repositories on your machines stay as they are."
			footer={
				<>
					<Button onClick={props.onClose}>Cancel</Button>
					<Button
						variant="danger"
						disabled={busy() || typed().trim() !== props.name}
						onClick={() => void remove()}
					>
						Delete workspace
					</Button>
				</>
			}
		>
			<Stack gap={3}>
				<Show when={error()}>{(message) => <Alert tone="danger" title={message()} />}</Show>
				<Field label={`Type ${props.name} to confirm`}>
					{(id) => (
						<Input
							id={id}
							value={typed()}
							onInput={(event) => setTyped(event.currentTarget.value)}
						/>
					)}
				</Field>
			</Stack>
		</Dialog>
	);
}
