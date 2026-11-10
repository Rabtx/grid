import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, Show } from "solid-js";

import {
	Alert,
	Badge,
	Button,
	CloudIcon,
	ConfirmDialog,
	CopyField,
	Dialog,
	Field,
	iconButton,
	Input,
	LaptopIcon,
	Menu,
	MoreIcon,
	notify,
	PlusIcon,
	Segmented,
	SettingsGroup,
	SettingsRow,
	Stack,
	Text,
} from "@/kit";
import { getApiOrigin } from "@/lib/api-client";
import { useAuth } from "@/modules/auth";
import { useWorkspaces } from "@/modules/workspaces";

import type { MachineEnrollment, TeamMachine } from "../services/machines.service";
import { machinesStore } from "../stores/machines";

const REFRESH_MS = 15_000;

const STATUS: Record<
	TeamMachine["status"],
	{ tone: "success" | "warning" | "neutral" | "danger"; label: string }
> = {
	online: { tone: "success", label: "Online" },
	pending: { tone: "warning", label: "Pending" },
	offline: { tone: "neutral", label: "Offline" },
	disabled: { tone: "danger", label: "Disabled" },
};

function kindLabel(kind: TeamMachine["kind"]): string {
	return kind === "managed" ? "Team server" : "Brought machine";
}

/** The command a teammate runs once, on the computer they are connecting. */
function installCommand(code: string): string {
	return `GRID_API_URL=${getApiOrigin()} GRID_ENROLLMENT_CODE=${code} curl -fsSL https://grid.rabtx.dev/install.sh | bash -s -- runner`;
}

/**
 * Team machines on Settings → Machines: a container this server starts for the teammate, or a
 * computer they connect themselves. Either one can be chosen per project in the machine picker.
 */
export function TeamMachines(): JSX.Element {
	const auth = useAuth();
	const workspaces = useWorkspaces();
	const [adding, setAdding] = createSignal(false);
	const [issued, setIssued] = createSignal<MachineEnrollment | null>(null);
	const [removing, setRemoving] = createSignal<TeamMachine | null>(null);
	const [pending, setPending] = createSignal(false);
	const viewer = () => workspaces.current()?.role === "viewer";

	createEffect(
		() => auth.token(),
		(token) => {
			if (!token) return;
			void machinesStore.reload(token);
			const timer = setInterval(() => void machinesStore.reload(token), REFRESH_MS);
			return () => clearInterval(timer);
		},
	);

	async function remove(): Promise<void> {
		const token = auth.token();
		const target = removing();
		if (!token || !target) return;
		setPending(true);
		try {
			await machinesStore.remove(token, target.id);
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

	async function reissue(machine: TeamMachine): Promise<void> {
		const token = auth.token();
		if (!token) return;
		try {
			setIssued(await machinesStore.reissue(token, machine.id));
		} catch (cause) {
			notify({
				title: cause instanceof Error ? cause.message : "Could not make a new code",
				tone: "danger",
			});
		}
	}

	return (
		<>
			<Show when={machinesStore.error()}>
				{(message) => <Alert tone="danger" title={message()} />}
			</Show>
			<SettingsGroup
				title="Team machines"
				description="A server this Grid starts for you, or a computer you connect."
				action={
					<Show when={!viewer()}>
						<Button
							size="sm"
							class="min-h-11"
							icon={<PlusIcon size="sm" />}
							onClick={() => setAdding(true)}
						>
							Add
						</Button>
					</Show>
				}
			>
				<Show
					when={machinesStore.machines().length > 0}
					fallback={
						<SettingsRow
							inline
							label="No team machines yet"
							description="Connect your computer, or start a server on this Grid"
						/>
					}
				>
					<For each={machinesStore.machines()}>
						{(machine) => (
							<SettingsRow
								inline
								leading={machine.kind === "managed" ? <CloudIcon /> : <LaptopIcon />}
								label={machine.name}
								description={[kindLabel(machine.kind), machine.ownerName]
									.filter(Boolean)
									.join(" · ")}
							>
								<Badge tone={STATUS[machine.status].tone} dot>
									{STATUS[machine.status].label}
								</Badge>
								<Show when={machine.canManage}>
									<Menu
										label={`Actions for ${machine.name}`}
										trigger={<MoreIcon />}
										triggerClass={iconButton({ size: "sm" })}
										placement="bottom-end"
										groups={[
											{
												items: [
													...(machine.kind === "byom" && machine.status !== "online"
														? [{ id: "reissue", label: "New connect code" }]
														: []),
													{ id: "remove", label: "Remove", danger: true },
												],
											},
										]}
										onSelect={(id) => {
											if (id === "remove") setRemoving(machine);
											if (id === "reissue") void reissue(machine);
										}}
									/>
								</Show>
							</SettingsRow>
						)}
					</For>
				</Show>
			</SettingsGroup>
			<AddTeamMachineDialog open={adding()} onClose={() => setAdding(false)} onIssued={setIssued} />
			<Dialog
				open={issued() !== null}
				onClose={() => setIssued(null)}
				title="Connect this computer"
				description="The code works once, for 15 minutes. The machine stays pending until it checks in."
			>
				<Stack gap={4}>
					<Show when={issued()}>
						{(enrollment) => (
							<>
								<Field label="Code">
									{() => <CopyField label="enrollment code" value={enrollment().code} mono />}
								</Field>
								<Field label="Install command" hint="Run this on the computer you are connecting.">
									{() => (
										<CopyField
											label="install command"
											value={installCommand(enrollment().code)}
											mono
										/>
									)}
								</Field>
							</>
						)}
					</Show>
					<Text size="caption" tone="subtle">
						Grid Runner keeps the code and joins this workspace. You can connect more than one
						computer.
					</Text>
				</Stack>
			</Dialog>
			<ConfirmDialog
				open={removing() !== null}
				title={`Remove ${removing()?.name ?? "this machine"}?`}
				description={
					removing()?.kind === "managed"
						? "Its container and the files inside it are deleted. Projects placed on it move back to this server."
						: "It stops receiving work from this workspace. Connect it again with a new code to bring it back."
				}
				confirm="Remove"
				danger
				pending={pending()}
				stayOpen
				onConfirm={() => void remove()}
				onClose={() => setRemoving(null)}
			/>
		</>
	);
}

function AddTeamMachineDialog(props: {
	open: boolean;
	onClose: () => void;
	onIssued: (enrollment: MachineEnrollment) => void;
}): JSX.Element {
	const auth = useAuth();
	const [kind, setKind] = createSignal<"byom" | "managed">("byom");
	const [name, setName] = createSignal("");
	const [busy, setBusy] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);
	const blocked = () => kind() === "managed" && !machinesStore.canProvision();

	const close = () => {
		setError(null);
		props.onClose();
	};

	async function submit(): Promise<void> {
		const token = auth.token();
		const chosen = kind();
		const label = name().trim();
		if (!token || busy() || !label || (chosen === "managed" && !machinesStore.canProvision()))
			return;
		setBusy(true);
		setError(null);
		try {
			const enrollment = await machinesStore.create(token, { name: label, kind: chosen });
			setName("");
			setKind("byom");
			close();
			if (chosen === "byom") props.onIssued(enrollment);
			else
				notify({
					title: "Starting the server",
					description: "It shows here once the container is running.",
					tone: "success",
				});
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not add the machine");
		} finally {
			setBusy(false);
		}
	}

	return (
		<Dialog
			open={props.open}
			onClose={close}
			title="Add a team machine"
			description="Your own computer, or a server this Grid starts for you."
			onSubmit={() => void submit()}
			footer={
				<>
					<Button onClick={close}>Cancel</Button>
					<Button
						variant="primary"
						disabled={busy() || !name().trim() || blocked()}
						onClick={() => void submit()}
					>
						{busy() ? "Adding…" : kind() === "managed" ? "Start server" : "Create code"}
					</Button>
				</>
			}
		>
			<Stack gap={4}>
				<Segmented
					block
					label="Kind of machine"
					value={kind()}
					onChange={setKind}
					options={[
						{ value: "byom", label: "Your computer" },
						{ value: "managed", label: "Team server" },
					]}
				/>
				<Field label="Name">
					{(id) => (
						<Input
							id={id}
							value={name()}
							onInput={(event) => setName(event.currentTarget.value)}
							placeholder={kind() === "managed" ? "My server" : "My laptop"}
							autocomplete="off"
						/>
					)}
				</Field>
				<Show when={blocked()}>
					<Alert
						tone="warning"
						title={
							machinesStore.provisionReason() ?? "This server can't start a container right now."
						}
					/>
				</Show>
				<Show when={error()}>{(message) => <Alert tone="danger" title={message()} />}</Show>
			</Stack>
		</Dialog>
	);
}
