import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, Show } from "solid-js";

import {
	Alert,
	Avatar,
	Badge,
	Button,
	ConfirmDialog,
	IconButton,
	LinkIcon,
	ListCard,
	ListRow,
	notify,
	Section,
	Skeleton,
	Stack,
	Text,
	UserAddIcon,
} from "@/kit";
import { useAuth } from "@/modules/auth";
import { useWorkspaces } from "@/modules/workspaces";
import { InviteSheet } from "@/modules/workspaces/components/invite-sheet";
import { MemberSheet } from "@/modules/workspaces/components/member-sheet";
import {
	canInvite,
	canManage,
	expiresIn,
	memberName,
	ROLE_LABEL,
} from "@/modules/workspaces/lib/members";
import { workspacesService } from "@/modules/workspaces/services/workspaces.service";
import type {
	CreatedInvite,
	CreateInviteInput,
	Invite,
	Member,
	WorkspaceRole,
} from "@/modules/workspaces/types/workspace.types";

import { SettingsPage } from "./settings-page";

const JOINED = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

function reason(cause: unknown, fallback: string): string {
	return cause instanceof Error ? cause.message : fallback;
}

/**
 * Settings → Members: who is in this workspace and what they can do. Everyone sees the people;
 * owners and admins also change roles, remove people, invite by link or email and revoke pending
 * invites. Tapping a person opens them; tapping an invite offers to revoke it.
 */
export function MembersScreen(): JSX.Element {
	const auth = useAuth();
	const workspaces = useWorkspaces();
	const slug = () => workspaces.current()?.slug ?? null;
	const me = (): WorkspaceRole => workspaces.current()?.role ?? "member";
	const myId = () => auth.user()?.id ?? null;
	const admin = () => canInvite(me());
	const removing = () => {
		const member = open();
		return member ? memberName(member) : "them";
	};

	const [members, setMembers] = createSignal<Member[] | null>(null);
	const [invites, setInvites] = createSignal<Invite[] | null>(null);
	const [error, setError] = createSignal<string | null>(null);
	const [busy, setBusy] = createSignal(false);
	const [open, setOpen] = createSignal<Member | null>(null);
	const [sheetError, setSheetError] = createSignal<string | null>(null);
	const [confirm, setConfirm] = createSignal<"remove" | "leave" | null>(null);
	const [inviting, setInviting] = createSignal(false);
	const [created, setCreated] = createSignal<CreatedInvite | null>(null);
	const [revoking, setRevoking] = createSignal<Invite | null>(null);

	async function load(): Promise<void> {
		const token = auth.token(),
			ws = slug();
		if (!token || !ws) return;
		try {
			const [people, pending] = await Promise.all([
				workspacesService.members(token, ws),
				admin() ? workspacesService.invites(token, ws) : Promise.resolve([]),
			]);
			setMembers(people);
			setInvites(pending);
			setError(null);
		} catch (cause) {
			setMembers((current) => current ?? []);
			setError(reason(cause, "Could not read this workspace's members"));
		}
	}
	createEffect(
		() => [auth.token(), slug(), me()] as const,
		() => void load(),
	);

	/** Run one change, then read the lists again; a refusal shows where the change was made. */
	async function change(run: (token: string, ws: string) => Promise<unknown>): Promise<boolean> {
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
			setSheetError(reason(cause, "That change did not go through"));
			return false;
		} finally {
			setBusy(false);
		}
	}

	async function saveRole(member: Member, role: WorkspaceRole): Promise<void> {
		if (await change((token, ws) => workspacesService.setRole(token, ws, member.userId, role))) {
			setOpen(null);
			notify({ title: `${memberName(member)} is now ${ROLE_LABEL[role].toLowerCase()}` });
		}
	}

	async function removeOrLeave(member: Member, leaving: boolean): Promise<void> {
		const done = await change((token, ws) =>
			workspacesService.removeMember(token, ws, member.userId),
		);
		setConfirm(null);
		if (!done) return;
		setOpen(null);
		// Leaving takes you out of this workspace: start over in the one you still belong to.
		if (leaving) location.assign("/");
		else notify({ title: `${memberName(member)} was removed` });
	}

	async function createInvite(input: CreateInviteInput): Promise<void> {
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

	async function revoke(invite: Invite): Promise<void> {
		const done = await change((token, ws) => workspacesService.revokeInvite(token, ws, invite.id));
		setRevoking(null);
		if (done) notify({ title: "Invite revoked" });
		else if (sheetError()) setError(sheetError());
	}

	return (
		<SettingsPage
			title="Members"
			description={`Who is in ${workspaces.current()?.name ?? "this workspace"} and what they can do.`}
			actions={
				<Show when={admin()}>
					<IconButton
						size="sm"
						label="Invite people"
						onClick={() => {
							setCreated(null);
							setSheetError(null);
							setInviting(true);
						}}
					>
						<UserAddIcon />
					</IconButton>
				</Show>
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

			<Section title="People">
				<Show
					when={members()}
					fallback={
						<Stack gap={1.5}>
							<Skeleton class="h-14" />
							<Skeleton class="h-14" />
						</Stack>
					}
				>
					{(people) => (
						<ListCard>
							<For each={people()}>
								{(member) => (
									<ListRow
										icon={<Avatar name={memberName(member)} size="xs" />}
										title={`${memberName(member)}${member.userId === myId() ? " (you)" : ""}`}
										subtitle={`@${member.username} · joined ${JOINED.format(Date.parse(member.joinedAt))}`}
										trailing={
											<Badge tone={member.role === "member" ? "neutral" : "accent"}>
												{ROLE_LABEL[member.role]}
											</Badge>
										}
										onClick={() => {
											setSheetError(null);
											setOpen(member);
										}}
									/>
								)}
							</For>
						</ListCard>
					)}
				</Show>
				<Show when={!admin()}>
					<Text size="caption" tone="subtle">
						Owners and admins invite people and change roles.
					</Text>
				</Show>
			</Section>

			<Show when={admin()}>
				<Section title="Pending invites">
					<Show
						when={(invites() ?? []).length > 0}
						fallback={
							<Text tone="subtle">
								No invites waiting. Invite someone and it shows here until they join.
							</Text>
						}
					>
						<ListCard>
							<For each={invites()}>
								{(invite) => (
									<ListRow
										icon={invite.email ? <UserAddIcon size="sm" /> : <LinkIcon size="sm" />}
										title={invite.email ?? "Invite link"}
										subtitle={`${ROLE_LABEL[invite.role]} · ${expiresIn(invite.expiresAt)}`}
										trailing="Revoke"
										onClick={() => setRevoking(invite)}
									/>
								)}
							</For>
						</ListCard>
					</Show>
				</Section>
			</Show>

			<Show when={open()}>
				{(member) => (
					<MemberSheet
						member={member()}
						me={me()}
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
				onClose={() => setConfirm(null)}
				onConfirm={() => {
					const member = open();
					if (member) void removeOrLeave(member, confirm() === "leave");
				}}
				title={confirm() === "leave" ? "Leave this workspace?" : `Remove ${removing()}?`}
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

			<Show when={inviting()}>
				<InviteSheet
					workspaceName={workspaces.current()?.name ?? "this workspace"}
					me={me()}
					busy={busy()}
					error={sheetError()}
					created={created()}
					onClose={() => {
						setInviting(false);
						setCreated(null);
					}}
					onCreate={(input) => void createInvite(input)}
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
