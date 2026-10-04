import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, Show } from "solid-js";

import {
	AgentLogo,
	Alert,
	Avatar,
	Badge,
	Button,
	ConfirmDialog,
	iconButton,
	InviteCard,
	LinkButton,
	Menu,
	MoreIcon,
	NobodyMark,
	notify,
	PillInput,
	SearchIcon,
	SearchInput,
	Select,
	SettingsGroup,
	SettingsRow,
	Skeleton,
	Spinner,
	Stack,
	Text,
	UserIcon,
} from "@/kit";
import { runnerCall } from "@/lib/runner-client";
import { useAuth } from "@/modules/auth";
import { offeredProviders, providersStore } from "@/modules/chat/stores/providers";
import { useShell } from "@/modules/shell";
import { useWorkspaces } from "@/modules/workspaces";
import { InviteSheet } from "@/modules/workspaces/components/invite-sheet";
import { MemberSheet } from "@/modules/workspaces/components/member-sheet";
import {
	canManage,
	choiceOf,
	isAdmin,
	mayDo,
	memberName,
	type RoleChoice,
	roleChoices,
	roleInput,
	roleName,
} from "@/modules/workspaces/lib/members";
import { workspacesService } from "@/modules/workspaces/services/workspaces.service";
import type {
	AgentAccess,
	CreatedInvite,
	CreateInviteInput,
	Invite,
	Member,
	WorkspaceRole,
} from "@/modules/workspaces/types/workspace.types";

import { ago } from "../lib/devices";

import { SettingsPage, settingsMenu } from "./settings-page";

/** Who uses an agent here, as the runner counts it. */
type AgentUsage = { provider: string; people: number; roles: string[] };

const ACCESS = [
	{ value: "everyone", label: "Everyone" },
	{ value: "admins", label: "Admins only" },
] as const;

const EMAIL = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

function reason(cause: unknown, fallback: string): string {
	return cause instanceof Error ? cause.message : fallback;
}

/**
 * Settings → Members (Figma 24): people and agents in the workspace. Admins invite by email (or
 * hand out a link), change roles, resend or revoke invites and choose who may start each agent;
 * everyone sees who is here. Agents always act for the person who started them.
 */
export function MembersScreen(): JSX.Element {
	const auth = useAuth();
	const shell = useShell();
	const workspaces = useWorkspaces();
	const slug = () => workspaces.current()?.slug ?? null;
	const me = (): WorkspaceRole => workspaces.current()?.role ?? "member";
	const myId = () => auth.user()?.id ?? null;
	const admin = () => isAdmin(me());
	const settings = () => workspaces.current()?.settings;
	// Inviting is a permission any role may be given (Settings → Roles), not only admins'.
	const inviter = () => {
		const current = workspaces.current();
		return current ? mayDo("invite", current.role, current.customRole, current.settings) : false;
	};

	const [members, setMembers] = createSignal<Member[] | null>(null);
	const [invites, setInvites] = createSignal<Invite[] | null>(null);
	const [usage, setUsage] = createSignal<AgentUsage[]>([]);
	const [error, setError] = createSignal<string | null>(null);
	const [busy, setBusy] = createSignal(false);
	const [emails, setEmails] = createSignal("");
	const [inviteRole, setInviteRole] = createSignal<RoleChoice>("member");
	const [query, setQuery] = createSignal("");
	const [open, setOpen] = createSignal<Member | null>(null);
	const [sheetError, setSheetError] = createSignal<string | null>(null);
	const [confirm, setConfirm] = createSignal<"remove" | "leave" | null>(null);
	const [linking, setLinking] = createSignal(false);
	const [created, setCreated] = createSignal<CreatedInvite | null>(null);
	const [revoking, setRevoking] = createSignal<Invite | null>(null);

	async function load(): Promise<void> {
		const token = auth.token(),
			ws = slug();
		if (!token || !ws) return;
		try {
			const [people, pending] = await Promise.all([
				workspacesService.members(token, ws),
				inviter() ? workspacesService.invites(token, ws) : Promise.resolve([]),
			]);
			setMembers(people);
			setInvites(pending);
			setError(null);
		} catch (cause) {
			setMembers((current) => current ?? []);
			setError(reason(cause, "Could not read this workspace's members"));
		}
		runnerCall<AgentUsage[]>("/agents/usage", token).then(setUsage, () => setUsage([]));
	}
	createEffect(
		() => [auth.token(), slug(), me()] as const,
		([token]) => {
			if (token) void providersStore.load(token);
			void load();
		},
	);

	/** Run one change, then read the lists again. */
	async function change(
		run: (token: string, ws: string) => Promise<unknown>,
		failure: string,
	): Promise<boolean> {
		const token = auth.token(),
			ws = slug();
		if (!token || !ws || busy()) return false;
		setBusy(true);
		setSheetError(null);
		try {
			await run(token, ws);
			await load();
			return true;
		} catch (cause) {
			const message = reason(cause, failure);
			setSheetError(message);
			notify({ title: failure, description: message });
			return false;
		} finally {
			setBusy(false);
		}
	}

	async function sendInvites(): Promise<void> {
		const list = emails()
			.split(/[,\s]+/)
			.map((item) => item.trim().toLowerCase())
			.filter(Boolean);
		const bad = list.find((item) => !EMAIL.test(item));
		if (bad) {
			notify({ title: `${bad} is not an email address` });
			return;
		}
		if (!list.length) return;
		const done = await change(async (token, ws) => {
			for (const email of list)
				await workspacesService.createInvite(token, ws, {
					email,
					...(roleInput(inviteRole()) as Pick<CreateInviteInput, "role" | "customRole">),
				});
		}, "Not invited");
		if (done) {
			setEmails("");
			notify({ title: list.length === 1 ? `Invited ${list[0]}` : `Invited ${list.length} people` });
		}
	}

	async function saveRole(member: Member, choice: RoleChoice): Promise<void> {
		const input = roleInput(choice);
		if (
			await change(
				(token, ws) => workspacesService.setRole(token, ws, member.userId, input),
				"Role not changed",
			)
		) {
			setOpen(null);
			notify({ title: `${memberName(member)} is now ${roleName(input, settings())}` });
		}
	}

	async function removeOrLeave(member: Member, leaving: boolean): Promise<void> {
		const done = await change(
			(token, ws) => workspacesService.removeMember(token, ws, member.userId),
			leaving ? "You did not leave" : "Not removed",
		);
		setConfirm(null);
		if (!done) return;
		setOpen(null);
		// Leaving takes you out of this workspace: start over in the one you still belong to.
		if (leaving) location.assign("/");
		else notify({ title: `${memberName(member)} was removed` });
	}

	async function createLink(input: CreateInviteInput): Promise<void> {
		const token = auth.token(),
			ws = slug();
		if (!token || !ws || busy()) return;
		setBusy(true);
		setSheetError(null);
		try {
			setCreated(await workspacesService.createInvite(token, ws, input));
			await load();
		} catch (cause) {
			setSheetError(reason(cause, "Could not create the invite"));
		} finally {
			setBusy(false);
		}
	}

	async function resend(invite: Invite): Promise<void> {
		if (
			await change(
				(token, ws) => workspacesService.resendInvite(token, ws, invite.id),
				"Not sent again",
			)
		)
			notify({ title: `Sent again to ${invite.email}` });
	}

	async function revoke(invite: Invite): Promise<void> {
		const done = await change(
			(token, ws) => workspacesService.revokeInvite(token, ws, invite.id),
			"Not revoked",
		);
		setRevoking(null);
		if (done) notify({ title: "Invite revoked" });
	}

	async function setAccess(provider: string, access: AgentAccess): Promise<void> {
		const done = await change(
			(token, ws) =>
				workspacesService.update(token, ws, { settings: { agentAccess: { [provider]: access } } }),
			"Not changed",
		);
		if (done) workspaces.refresh();
	}

	const people = () => {
		const text = query().trim().toLowerCase();
		const list = members() ?? [];
		return text
			? list.filter((member) =>
					[memberName(member), member.username, member.email ?? ""].some((value) =>
						value.toLowerCase().includes(text),
					),
				)
			: list;
	};
	const agents = () => offeredProviders(providersStore.providers());
	const accessOf = (provider: string): AgentAccess =>
		workspaces.current()?.settings?.agentAccess?.[provider] ?? "everyone";
	const accessLabel = (provider: string) =>
		ACCESS.find((item) => item.value === accessOf(provider))?.label;
	const agentLine = (provider: string) => {
		const used = usage().find((item) => item.provider === provider);
		const parts = [
			used?.roles.length ? used.roles.join(", ") : null,
			used?.people ? `used by ${used.people} ${used.people === 1 ? "person" : "people"}` : null,
		].filter(Boolean);
		return parts.length ? parts.join(" · ") : "Not used yet";
	};
	const count = () => members()?.length ?? 0;
	const peopleLine = () => `${count()} ${count() === 1 ? "person" : "people"}`;
	const inviteRoles = () =>
		roleChoices(me(), settings(), { owner: false }).map(({ value, label }) => ({ value, label }));
	const openLink = () => {
		setCreated(null);
		setSheetError(null);
		setLinking(true);
	};

	/** A member's role on the right: a picker for those you may change, else the word. */
	const roleControl = (member: Member) => (
		<Show
			when={shell.desktop() && canManage(me(), member, myId())}
			fallback={
				<Text tone="subtle" class="max-md:hidden">
					{roleName(member, settings())}
				</Text>
			}
		>
			<Select<RoleChoice>
				look="pill"
				label={`${memberName(member)}'s role`}
				value={choiceOf(member)}
				onChange={(choice) => void saveRole(member, choice)}
				groups={[
					{
						options: roleChoices(me(), settings()).map(({ value, label }) => ({ value, label })),
					},
				]}
			/>
		</Show>
	);
	const memberMenu = (member: Member) => {
		const isYou = member.userId === myId();
		const manage = canManage(me(), member, myId());
		return (
			<Show when={isYou || manage}>
				<Menu
					label={`Actions for ${memberName(member)}`}
					title={memberName(member)}
					trigger={<MoreIcon />}
					triggerClass={iconButton({ size: "sm" })}
					placement="bottom-end"
					groups={[
						...(manage && !shell.desktop()
							? [{ items: [{ id: "role", label: "Change role" }] }]
							: []),
						{
							items: [
								isYou
									? { id: "leave", label: "Leave workspace", danger: true }
									: { id: "remove", label: "Remove from workspace", danger: true },
							],
						},
					]}
					onSelect={(id) => {
						setOpen(member);
						setSheetError(null);
						if (id === "leave") setConfirm("leave");
						else if (id === "remove") setConfirm("remove");
					}}
				/>
			</Show>
		);
	};

	return (
		<SettingsPage
			title="Members"
			description={`People and agents in ${workspaces.current()?.name ?? "this workspace"}. Agents always act for the person who started them.`}
			subtitle={members() ? peopleLine() : undefined}
			menu={
				inviter()
					? settingsMenu(
							"Members",
							[{ items: [{ id: "link", label: "Create an invite link" }] }],
							openLink,
						)
					: undefined
			}
		>
			<Show when={error()}>
				{(message) => (
					<Alert
						tone="danger"
						title={message()}
						action={
							<Button size="sm" onClick={() => void load()}>
								Try again
							</Button>
						}
					/>
				)}
			</Show>

			<Show when={inviter()}>
				<InviteCard
					field={
						<PillInput
							icon={<UserIcon />}
							aria-label="Emails to invite"
							placeholder={
								shell.desktop() ? "name@company.com, separate with commas" : "name@company.com"
							}
							value={emails()}
							onInput={(event) => setEmails(event.currentTarget.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") void sendInvites();
							}}
						/>
					}
					role={
						<Select<RoleChoice>
							look="pill"
							label="Invite as"
							value={inviteRole()}
							onChange={setInviteRole}
							groups={[{ options: inviteRoles() }]}
						/>
					}
					action={
						<Button
							variant="primary"
							disabled={busy() || !emails().trim()}
							onClick={() => void sendInvites()}
						>
							<Show when={busy()} fallback="Send invite">
								<Spinner label="Sending" />
							</Show>
						</Button>
					}
					footer={
						<>
							<span>{peopleLine()} · agents don't use seats</span>
							<LinkButton tone="accent" onClick={openLink}>
								Invite link
							</LinkButton>
						</>
					}
				/>
			</Show>

			<SettingsGroup
				title="People"
				action={
					<Show when={shell.desktop() && count() > 3}>
						<div class="w-48">
							<SearchInput
								icon={<SearchIcon size="sm" />}
								aria-label="Search people"
								placeholder="Search"
								value={query()}
								onInput={(event) => setQuery(event.currentTarget.value)}
							/>
						</div>
					</Show>
				}
			>
				<Show
					when={members()}
					fallback={
						<div class="p-3">
							<Stack gap={2}>
								<Skeleton class="h-10" />
								<Skeleton class="h-10" />
							</Stack>
						</div>
					}
				>
					<For each={people()}>
						{(member) => (
							<SettingsRow
								inline
								mark={<Avatar name={memberName(member)} src={member.avatarUrl} size="lg" />}
								label={
									<span class="flex items-center gap-1.5">
										{memberName(member)}
										<Show when={member.userId === myId() && shell.desktop()}>
											<Badge>You</Badge>
										</Show>
									</span>
								}
								description={
									shell.desktop()
										? (member.email ?? `@${member.username}`)
										: `${roleName(member, settings())}${member.userId === myId() ? " · you" : ""}`
								}
							>
								{roleControl(member)}
								{memberMenu(member)}
							</SettingsRow>
						)}
					</For>
					<For each={invites() ?? []}>
						{(invite) => (
							<SettingsRow
								inline
								mark={<NobodyMark size="lg" />}
								label={invite.email ?? "Invite link"}
								description={
									shell.desktop() ? `Invited ${ago(invite.createdAt)}` : "Invite pending"
								}
							>
								<span class="max-md:hidden">
									<Badge tone="warning" dot>
										Pending
									</Badge>
								</span>
								<Show when={invite.email}>
									<LinkButton onClick={() => void resend(invite)}>Resend</LinkButton>
								</Show>
								<Menu
									label={`Actions for the invite to ${invite.email ?? "a link"}`}
									trigger={<MoreIcon />}
									triggerClass={iconButton({ size: "sm" })}
									placement="bottom-end"
									groups={[{ items: [{ id: "revoke", label: "Revoke invite", danger: true }] }]}
									onSelect={() => setRevoking(invite)}
								/>
							</SettingsRow>
						)}
					</For>
				</Show>
			</SettingsGroup>

			<Show when={agents().length}>
				<SettingsGroup title="Agents" description="Teammates too. Choose who can start each one.">
					<For each={agents()}>
						{(agent) => (
							<SettingsRow
								inline
								mark={<AgentLogo id={agent.id} name={agent.name} />}
								label={agent.name}
								description={
									shell.desktop()
										? agentLine(agent.id)
										: admin()
											? undefined
											: accessLabel(agent.id)
								}
							>
								<Show
									when={admin()}
									fallback={
										<Text tone="subtle" class="max-md:hidden">
											{accessLabel(agent.id)}
										</Text>
									}
								>
									<Select<AgentAccess>
										look={shell.desktop() ? "pill" : "value"}
										label={`Who can start ${agent.name}`}
										value={accessOf(agent.id)}
										onChange={(access) => void setAccess(agent.id, access)}
										groups={[{ options: ACCESS }]}
									/>
								</Show>
							</SettingsRow>
						)}
					</For>
				</SettingsGroup>
			</Show>

			<Show when={open() && !confirm() ? open() : null}>
				{(member) => (
					<MemberSheet
						member={member()}
						me={me()}
						settings={settings()}
						isYou={member().userId === myId()}
						canManage={canManage(me(), member(), myId())}
						busy={busy()}
						error={sheetError()}
						onClose={() => setOpen(null)}
						onSave={(role) => void saveRole(member(), role)}
						onRemove={() => setConfirm("remove")}
						onLeave={() => setConfirm("leave")}
					/>
				)}
			</Show>

			<ConfirmDialog
				open={confirm() !== null}
				onClose={() => {
					setConfirm(null);
					setOpen(null);
				}}
				onConfirm={() => {
					const member = open();
					if (member) void removeOrLeave(member, confirm() === "leave");
				}}
				title={
					confirm() === "leave"
						? "Leave this workspace?"
						: `Remove ${open() ? memberName(open() as Member) : "them"}?`
				}
				description={
					confirm() === "leave"
						? "You lose access to its projects and threads until someone invites you back."
						: "They lose access to this workspace's projects and threads. You can invite them again later."
				}
				confirm={confirm() === "leave" ? "Leave" : "Remove"}
				danger
				pending={busy()}
				stayOpen
			/>

			<Show when={linking()}>
				<InviteSheet
					workspaceName={workspaces.current()?.name ?? "this workspace"}
					me={me()}
					settings={settings()}
					busy={busy()}
					error={sheetError()}
					created={created()}
					onClose={() => {
						setLinking(false);
						setCreated(null);
					}}
					onCreate={(input) => void createLink(input)}
					onAnother={() => {
						setCreated(null);
						setSheetError(null);
					}}
				/>
			</Show>

			<ConfirmDialog
				open={revoking() !== null}
				onClose={() => setRevoking(null)}
				onConfirm={() => {
					const invite = revoking();
					if (invite) void revoke(invite);
				}}
				title="Revoke this invite?"
				description={
					revoking()?.email
						? `${revoking()?.email} will not be able to join with it.`
						: "Anyone holding the link will not be able to join with it."
				}
				confirm="Revoke"
				danger
				pending={busy()}
				stayOpen
			/>
		</SettingsPage>
	);
}
