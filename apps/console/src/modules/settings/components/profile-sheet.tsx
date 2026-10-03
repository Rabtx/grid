import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, Show } from "solid-js";

import {
	Avatar,
	Badge,
	Button,
	Dialog,
	Field,
	Input,
	LaptopIcon,
	Select,
	SettingsRow,
	Stack,
	Text,
} from "@/kit";
import { passkeysSupported } from "@/lib/webauthn";

import { ago, deviceName, timeZones, zoneOffset } from "../lib/devices";
import type { Me, ProfilePatch, Security, SignInSession } from "../services/account.service";

/** Which of Profile's sheets is open on a phone. */
export type Sheet = "edit" | "username" | "email" | "timezone" | "passkeys" | "sessions";

const TITLES: Record<Sheet, string> = {
	edit: "Edit profile",
	username: "Username",
	email: "Email",
	timezone: "Timezone",
	passkeys: "Passkeys",
	sessions: "Sessions",
};

/**
 * The sheets Profile opens on phones (Figma Profile — Mobile): your name and photo, username, email,
 * time zone, passkeys and where you are signed in. Each saves as the desktop rows do.
 */
export function ProfileSheet(props: {
	sheet: Sheet | null;
	person: Me | null;
	security: Security | null;
	sessions: SignInSession[] | null;
	zone: string;
	onClose: () => void;
	onPhoto: () => void;
	onSave: (patch: ProfilePatch, what: string) => void;
	onAddPasskey: () => void;
	onSignOut: (session: SignInSession) => void;
	onSignOutOthers: () => void;
}): JSX.Element {
	const [draft, setDraft] = createSignal("");
	createEffect(
		() => [props.sheet, props.person] as const,
		([sheet, person]) => {
			if (sheet === "edit") setDraft(person?.profile.displayName ?? "");
			else if (sheet === "username") setDraft(person?.username ?? "");
		},
	);
	const save = () => {
		const value = draft().trim();
		if (props.sheet === "edit") props.onSave({ displayName: value || null }, "Your name");
		else if (props.sheet === "username" && value)
			props.onSave({ username: value.replace(/^@/, "").toLowerCase() }, "Your username");
		props.onClose();
	};
	const editing = () => props.sheet === "edit" || props.sheet === "username";
	const name = () => props.person?.profile.displayName || props.person?.username || "";

	return (
		<Dialog
			open={props.sheet !== null}
			onClose={props.onClose}
			title={props.sheet ? TITLES[props.sheet] : ""}
			footer={
				<Show when={editing()}>
					<Button onClick={props.onClose}>Cancel</Button>
					<Button variant="primary" onClick={save}>
						Save
					</Button>
				</Show>
			}
		>
			<Show when={props.sheet === "edit"}>
				<Stack gap={4}>
					<div class="flex items-center gap-3">
						<Avatar name={name()} src={props.person?.profile.avatarUrl} size="xl" />
						<Button size="sm" onClick={props.onPhoto}>
							Change photo
						</Button>
					</div>
					<Field label="Name">
						{(id) => (
							<Input
								id={id}
								maxlength={100}
								value={draft()}
								placeholder={props.person?.username}
								onInput={(event) => setDraft(event.currentTarget.value)}
							/>
						)}
					</Field>
				</Stack>
			</Show>
			<Show when={props.sheet === "username"}>
				<Field label="Username" hint="Used for @mentions.">
					{(id) => (
						<Input
							id={id}
							maxlength={64}
							value={draft()}
							onInput={(event) => setDraft(event.currentTarget.value)}
						/>
					)}
				</Field>
			</Show>
			<Show when={props.sheet === "email"}>
				<Stack gap={2}>
					<Text>{props.person?.email}</Text>
					<div>
						<Show
							when={props.person?.emailVerified}
							fallback={<Badge tone="warning">Not verified</Badge>}
						>
							<Badge tone="success">Verified</Badge>
						</Show>
					</div>
				</Stack>
			</Show>
			<Show when={props.sheet === "timezone"}>
				<Field label="Timezone" hint="Quiet hours and run times use this.">
					{() => (
						<Select
							look="field"
							label="Timezone"
							value={props.zone}
							onChange={(timezone) => props.onSave({ timezone }, "Your timezone")}
							groups={[
								{
									options: timeZones().map((value) => ({
										value,
										label: `${value} · ${zoneOffset(value)}`,
									})),
								},
							]}
						/>
					)}
				</Field>
			</Show>
			<Show when={props.sheet === "passkeys"}>
				<Stack gap={3}>
					<Show
						when={props.security?.passkeys.length}
						fallback={<Text tone="subtle">Sign in with your fingerprint or face.</Text>}
					>
						<div class="divide-y divide-line">
							<For each={props.security?.passkeys ?? []}>
								{(passkey) => (
									<SettingsRow
										inline
										label={passkey.name}
										description={`Added ${ago(passkey.createdAt)}`}
									/>
								)}
							</For>
						</div>
					</Show>
					<Show when={passkeysSupported()}>
						<Button onClick={props.onAddPasskey}>Add a passkey</Button>
					</Show>
				</Stack>
			</Show>
			<Show when={props.sheet === "sessions"}>
				<Stack gap={3}>
					<div class="divide-y divide-line">
						<For each={props.sessions ?? []}>
							{(session) => (
								<SettingsRow
									inline
									leading={<LaptopIcon />}
									label={deviceName(session.userAgent)}
									description={session.isCurrent ? "active now" : ago(session.lastUsedAt)}
								>
									<Show
										when={!session.isCurrent}
										fallback={<Badge tone="neutral">This device</Badge>}
									>
										<Button size="sm" onClick={() => props.onSignOut(session)}>
											Sign out
										</Button>
									</Show>
								</SettingsRow>
							)}
						</For>
					</div>
					<Show when={(props.sessions ?? []).some((session) => !session.isCurrent)}>
						<Button onClick={props.onSignOutOthers}>Sign out others</Button>
					</Show>
				</Stack>
			</Show>
		</Dialog>
	);
}
