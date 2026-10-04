import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, Show } from "solid-js";

import {
	Alert,
	Avatar,
	Button,
	ConfirmDialog,
	Dialog,
	Field,
	Input,
	notify,
	PermissionCell,
	PermissionMatrix,
	PermissionRow,
	PlusIcon,
	RadioCards,
	Row,
	SettingsGroup,
	SettingsLinkRow,
	SettingsRow,
	Skeleton,
	Spinner,
	Stack,
	Switch,
	Text,
} from "@/kit";
import { useAuth } from "@/modules/auth";
import { useShell } from "@/modules/shell";
import { useWorkspaces } from "@/modules/workspaces";
import {
	isAdmin,
	mayDo,
	memberName,
	PERMISSIONS,
	ROLE_DEFAULTS,
	ROLE_HINT,
	ROLE_LABEL,
} from "@/modules/workspaces/lib/members";
import { workspacesService } from "@/modules/workspaces/services/workspaces.service";
import type {
	CustomRole,
	Member,
	RolePermission,
	WorkspaceRole,
	WorkspaceSettings,
} from "@/modules/workspaces/types/workspace.types";

import { SettingsPage, settingsMenu } from "./settings-page";

/** A role as the page lists it: a built-in one, or one the workspace made. */
type RoleRef = { kind: "built-in"; role: WorkspaceRole } | { kind: "custom"; role: CustomRole };

const BUILT_IN: readonly WorkspaceRole[] = ["owner", "admin", "member", "viewer"];

function reason(cause: unknown, fallback: string): string {
	return cause instanceof Error && cause.message ? cause.message : fallback;
}

function peopleCount(count: number | null): string {
	if (count === null) return "";
	if (count === 0) return "No one";
	return `${count} ${count === 1 ? "person" : "people"}`;
}

/** An id for a new role from its name, not taken by another. */
function roleId(name: string, taken: readonly string[]): string {
	const base =
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "")
			.slice(0, 48) || "role";
	let id = base;
	for (let n = 2; taken.includes(id) || BUILT_IN.includes(id as WorkspaceRole); n++)
		id = `${base}-${n}`;
	return id;
}

/**
 * Settings → Roles (Figma 24 · Roles): the workspace's roles with how many people hold each, and
 * what each may do as a table to change cell by cell (the owner's column is fixed). Phones list
 * the roles and, under them, the chosen role's permissions as switches. Agents always act with
 * the role of whoever started them, so this is also what an agent may do for them.
 */
export function RolesScreen(): JSX.Element {
	const auth = useAuth();
	const shell = useShell();
	const workspaces = useWorkspaces();
	const admin = () => isAdmin(workspaces.current()?.role);

	// What the page shows: the saved settings, changed here at once and saved behind.
	const [settings, setSettings] = createSignal<WorkspaceSettings>({});
	createEffect(
		() => workspaces.current()?.settings,
		(saved) => {
			setSettings(saved ?? {});
		},
	);
	const custom = () => settings().customRoles ?? [];

	const [members, setMembers] = createSignal<Member[] | null>(null);
	createEffect(
		() => [auth.token(), workspaces.current()?.slug] as const,
		([token, slug]) => {
			if (!token || !slug) return;
			workspacesService.members(token, slug).then(setMembers, () => setMembers([]));
		},
	);

	const roles = (): RoleRef[] => [
		...BUILT_IN.map((role) => ({ kind: "built-in" as const, role })),
		...custom().map((role) => ({ kind: "custom" as const, role })),
	];
	const holders = (ref: RoleRef): Member[] =>
		(members() ?? []).filter((member) =>
			ref.kind === "custom"
				? member.customRole === ref.role.id
				: member.role === ref.role && !member.customRole,
		);
	const nameOf = (ref: RoleRef) => (ref.kind === "custom" ? ref.role.name : ROLE_LABEL[ref.role]);
	const hintOf = (ref: RoleRef) =>
		ref.kind === "custom" ? (ref.role.description ?? "") : ROLE_HINT[ref.role];
	const keyOf = (ref: RoleRef) => (ref.kind === "custom" ? `custom:${ref.role.id}` : ref.role);
	const allows = (ref: RoleRef, permission: RolePermission): boolean =>
		ref.kind === "custom"
			? ref.role.permissions[permission] === true
			: mayDo(permission, ref.role, null, settings());
	// The owner may do everything, always; everyone else's cells change when you may change them.
	const editable = (ref: RoleRef) => admin() && !(ref.kind === "built-in" && ref.role === "owner");

	async function save(change: WorkspaceSettings, failure: string): Promise<boolean> {
		const token = auth.token(),
			ws = workspaces.current()?.slug;
		if (!token || !ws) return false;
		try {
			await workspacesService.update(token, ws, { settings: change });
			workspaces.refresh();
			return true;
		} catch (cause) {
			setSettings(workspaces.current()?.settings ?? {});
			notify({ title: failure, description: reason(cause, "Try again") });
			return false;
		}
	}

	function toggle(ref: RoleRef, permission: RolePermission): void {
		if (!editable(ref)) return;
		const next = !allows(ref, permission);
		if (ref.kind === "custom") {
			const list = custom().map((role) =>
				role.id === ref.role.id
					? { ...role, permissions: { ...role.permissions, [permission]: next } }
					: role,
			);
			setSettings({ ...settings(), customRoles: list });
			void save({ customRoles: list }, "Not changed");
			return;
		}
		const role = ref.role as Exclude<WorkspaceRole, "owner">;
		const change = { [role]: { [permission]: next } };
		setSettings({
			...settings(),
			rolePermissions: {
				...settings().rolePermissions,
				[role]: { ...settings().rolePermissions?.[role], [permission]: next },
			},
		});
		void save({ rolePermissions: change }, "Not changed");
	}

	// Phones: the role whose permissions show under the list.
	const [chosen, setChosen] = createSignal<string>("member");
	const chosenRef = () => roles().find((ref) => keyOf(ref) === chosen()) ?? roles()[2];
	// Desktop: the role opened from the list.
	const [opened, setOpened] = createSignal<RoleRef | null>(null);
	const [creating, setCreating] = createSignal(false);
	const [deleting, setDeleting] = createSignal<CustomRole | null>(null);

	async function create(input: {
		name: string;
		description: string;
		from: "member" | "viewer";
	}): Promise<boolean> {
		const role: CustomRole = {
			id: roleId(
				input.name,
				custom().map((item) => item.id),
			),
			name: input.name,
			...(input.description ? { description: input.description } : {}),
			permissions: { ...ROLE_DEFAULTS[input.from] },
		};
		const list = [...custom(), role];
		if (!(await save({ customRoles: list }, "Role not added"))) return false;
		setSettings({ ...settings(), customRoles: list });
		notify({ title: `${role.name} added`, description: "Give it to people in Members." });
		return true;
	}

	async function rename(id: string, name: string, description: string): Promise<boolean> {
		const list = custom().map((role) =>
			role.id === id ? { ...role, name, description: description || undefined } : role,
		);
		if (!(await save({ customRoles: list }, "Not saved"))) return false;
		setSettings({ ...settings(), customRoles: list });
		return true;
	}

	async function remove(role: CustomRole): Promise<void> {
		const list = custom().filter((item) => item.id !== role.id);
		if (await save({ customRoles: list }, "Role not deleted")) {
			setSettings({ ...settings(), customRoles: list });
			if (chosen() === `custom:${role.id}`) setChosen("member");
			setOpened(null);
			const token = auth.token(),
				ws = workspaces.current()?.slug;
			if (token && ws) workspacesService.members(token, ws).then(setMembers, () => undefined);
			notify({ title: `${role.name} deleted`, description: "People who had it are members now." });
		}
		setDeleting(null);
	}

	const roleRow = (ref: RoleRef) => (
		<SettingsLinkRow
			label={nameOf(ref)}
			description={shell.desktop() ? hintOf(ref) || undefined : undefined}
			value={
				members()
					? shell.desktop()
						? peopleCount(holders(ref).length)
						: String(holders(ref).length)
					: ""
			}
			onClick={() => (shell.desktop() ? setOpened(ref) : setChosen(keyOf(ref)))}
		/>
	);

	const menuGroups = () => {
		const ref = chosenRef();
		return [
			{ items: [{ id: "new", label: "New role", icon: <PlusIcon /> }] },
			...(!shell.desktop() && ref?.kind === "custom"
				? [
						{
							items: [
								{ id: "edit", label: `Rename ${ref.role.name}` },
								{ id: "delete", label: `Delete ${ref.role.name}`, danger: true },
							],
						},
					]
				: []),
		];
	};

	return (
		<SettingsPage
			title="Roles"
			description="Roles decide what people can do. Agents always act with the role of whoever started them."
			subtitle={`${roles().length} roles`}
			menu={
				admin()
					? settingsMenu("Roles", menuGroups(), (id) => {
							const ref = chosenRef();
							if (id === "new") setCreating(true);
							else if (id === "edit" && ref) setOpened(ref);
							else if (id === "delete" && ref?.kind === "custom") setDeleting(ref.role);
						})
					: undefined
			}
		>
			<SettingsGroup
				title="Roles"
				action={
					<Show when={admin() && shell.desktop()}>
						<Button size="sm" onClick={() => setCreating(true)}>
							New role
						</Button>
					</Show>
				}
			>
				<For each={roles()}>{(ref) => roleRow(ref)}</For>
			</SettingsGroup>

			<Show
				when={shell.desktop()}
				fallback={
					<Show when={chosenRef()}>
						{(ref) => (
							<SettingsGroup title={`${nameOf(ref())} can`}>
								<For each={PERMISSIONS}>
									{(permission) => (
										<SettingsRow inline label={permission.label}>
											<Switch
												label={`${nameOf(ref())}: ${permission.label}`}
												checked={allows(ref(), permission.id)}
												disabled={!editable(ref())}
												onChange={() => toggle(ref(), permission.id)}
											/>
										</SettingsRow>
									)}
								</For>
							</SettingsGroup>
						)}
					</Show>
				}
			>
				<section class="flex flex-col gap-3">
					<Stack gap={0.5}>
						<Text tone="strong" weight="medium" size="body-lg">
							What each role can do
						</Text>
						<Text size="caption" tone="subtle">
							{admin()
								? "Click a cell to change it. Owner can't be edited."
								: "Only owners and admins change these."}
						</Text>
					</Stack>
					<PermissionMatrix columns={roles().map(nameOf)}>
						<For each={PERMISSIONS}>
							{(permission) => (
								<PermissionRow label={permission.label}>
									<For each={roles()}>
										{(ref) => (
											<PermissionCell
												on={allows(ref, permission.id)}
												label={`${nameOf(ref)}: ${permission.label}`}
												onToggle={editable(ref) ? () => toggle(ref, permission.id) : undefined}
											/>
										)}
									</For>
								</PermissionRow>
							)}
						</For>
						<PermissionRow label="Billing and delete workspace">
							<For each={roles()}>
								{(ref) => (
									<PermissionCell
										on={ref.kind === "built-in" && ref.role === "owner"}
										label={`${nameOf(ref)}: Billing and delete workspace`}
									/>
								)}
							</For>
						</PermissionRow>
					</PermissionMatrix>
				</section>
			</Show>

			{/* The sheet steps aside while its role's deletion is confirmed, as the members sheet does. */}
			<Show when={opened() && !deleting() ? opened() : null}>
				{(ref) => (
					<RoleSheet
						role={ref()}
						name={nameOf(ref())}
						hint={hintOf(ref())}
						people={members() ? holders(ref()) : null}
						editable={admin() && ref().kind === "custom"}
						onClose={() => setOpened(null)}
						onRename={(name, description) =>
							ref().kind === "custom"
								? rename((ref().role as CustomRole).id, name, description)
								: Promise.resolve(false)
						}
						onDelete={() => {
							const current = ref();
							if (current.kind === "custom") setDeleting(current.role);
						}}
					/>
				)}
			</Show>

			<Show when={creating()}>
				<NewRoleDialog onClose={() => setCreating(false)} onCreate={create} />
			</Show>

			<ConfirmDialog
				open={deleting() !== null}
				onClose={() => setDeleting(null)}
				onConfirm={() => {
					const role = deleting();
					if (role) void remove(role);
				}}
				title={`Delete ${deleting()?.name ?? "this role"}?`}
				description="People who have it become members. Invites for it join as members."
				confirm="Delete role"
				danger
			/>
		</SettingsPage>
	);
}

/**
 * One role, opened from the list on desktop: who holds it and what it is for; a role the
 * workspace made can be renamed or deleted here (its permissions change in the table).
 */
function RoleSheet(props: {
	role: RoleRef;
	name: string;
	hint: string;
	people: Member[] | null;
	editable: boolean;
	onClose: () => void;
	onRename: (name: string, description: string) => Promise<boolean>;
	onDelete: () => void;
}): JSX.Element {
	const [name, setName] = createSignal(props.name);
	const [description, setDescription] = createSignal(props.hint);
	const [busy, setBusy] = createSignal(false);
	const changed = () => name().trim() !== props.name || description().trim() !== props.hint;

	async function saveName(): Promise<void> {
		if (!name().trim() || busy()) return;
		setBusy(true);
		const done = await props.onRename(name().trim(), description().trim());
		setBusy(false);
		if (done) props.onClose();
	}

	return (
		<Dialog
			open={true}
			title={props.name}
			description={props.editable ? undefined : props.hint}
			onClose={props.onClose}
			footer={
				<Show when={props.editable} fallback={<Button onClick={props.onClose}>Close</Button>}>
					<Button variant="danger" onClick={props.onDelete}>
						Delete role
					</Button>
					<Button
						variant="primary"
						disabled={busy() || !changed() || !name().trim()}
						onClick={() => void saveName()}
					>
						<Show when={busy()} fallback="Save">
							<Spinner /> Saving…
						</Show>
					</Button>
				</Show>
			}
		>
			<Stack gap={4}>
				<Show when={props.editable}>
					<Field label="Name">
						{(id) => (
							<Input
								id={id}
								maxlength={40}
								value={name()}
								onInput={(event) => setName(event.currentTarget.value)}
							/>
						)}
					</Field>
					<Field label="What it is for" hint="Shown beside the role in the list.">
						{(id) => (
							<Input
								id={id}
								maxlength={120}
								value={description()}
								onInput={(event) => setDescription(event.currentTarget.value)}
							/>
						)}
					</Field>
				</Show>
				<Stack gap={2}>
					<Text size="caption" tone="subtle">
						People with this role
					</Text>
					<Show when={props.people} fallback={<Skeleton class="h-8" />}>
						{(people) => (
							<Show
								when={people().length > 0}
								fallback={<Text tone="subtle">No one yet. Give it to people in Members.</Text>}
							>
								<For each={people()}>
									{(member) => (
										<Row gap={2.5}>
											<Avatar name={memberName(member)} src={member.avatarUrl} size="md" />
											<Text truncate>{memberName(member)}</Text>
										</Row>
									)}
								</For>
							</Show>
						)}
					</Show>
				</Stack>
			</Stack>
		</Dialog>
	);
}

/** A new role: its name, a line on what it is for, and whose permissions it starts with. */
function NewRoleDialog(props: {
	onClose: () => void;
	onCreate: (input: {
		name: string;
		description: string;
		from: "member" | "viewer";
	}) => Promise<boolean>;
}): JSX.Element {
	const [name, setName] = createSignal("");
	const [description, setDescription] = createSignal("");
	const [from, setFrom] = createSignal<"member" | "viewer">("member");
	const [busy, setBusy] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);

	async function submit(): Promise<void> {
		if (!name().trim() || busy()) return;
		setBusy(true);
		setError(null);
		const done = await props.onCreate({
			name: name().trim(),
			description: description().trim(),
			from: from(),
		});
		setBusy(false);
		if (done) props.onClose();
		else setError("The role was not added. Try again.");
	}

	return (
		<Dialog
			open={true}
			title="New role"
			description="It ranks as a member, with the permissions you give it."
			onClose={props.onClose}
			footer={
				<>
					<Button onClick={props.onClose}>Cancel</Button>
					<Button
						variant="primary"
						disabled={busy() || !name().trim()}
						onClick={() => void submit()}
					>
						<Show when={busy()} fallback="Add role">
							<Spinner /> Adding…
						</Show>
					</Button>
				</>
			}
		>
			<Stack gap={4}>
				<Show when={error()}>{(message) => <Alert tone="danger" title={message()} />}</Show>
				<Field label="Name">
					{(id) => (
						<Input
							id={id}
							maxlength={40}
							placeholder="Contractor"
							value={name()}
							onInput={(event) => setName(event.currentTarget.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") void submit();
							}}
						/>
					)}
				</Field>
				<Field label="What it is for">
					{(id) => (
						<Input
							id={id}
							maxlength={120}
							placeholder="Works on one project, can't merge"
							value={description()}
							onInput={(event) => setDescription(event.currentTarget.value)}
						/>
					)}
				</Field>
				<RadioCards
					label="Starts with"
					options={[
						{ value: "member", label: "Member's permissions", description: ROLE_HINT.member },
						{ value: "viewer", label: "Viewer's permissions", description: ROLE_HINT.viewer },
					]}
					value={from()}
					onChange={setFrom}
				/>
			</Stack>
		</Dialog>
	);
}
