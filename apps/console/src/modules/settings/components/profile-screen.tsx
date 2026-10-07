import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, Show, untrack } from "solid-js";

import {
	Alert,
	Avatar,
	Badge,
	Button,
	Dialog,
	Field,
	IdentityCard,
	Input,
	LaptopIcon,
	LinkButton,
	MonoValue,
	notify,
	PasswordInput,
	PillInput,
	Select,
	SettingsGroup,
	SettingsLinkRow,
	SettingsRow,
	Skeleton,
	Spinner,
	Stack,
	Switch,
	Text,
	UserIcon,
} from "@/kit";
import { createPasskey, passkeysSupported } from "@/lib/webauthn";
import { useShell } from "@/modules/shell";
import { useAuth } from "@/modules/auth";
import { useWorkspaces } from "@/modules/workspaces";
import { ROLE_LABEL } from "@/modules/workspaces/lib/members";

import { ago, deviceName, LOCAL_ZONE, timeZones, zoneOffset } from "../lib/devices";
import {
	accountService,
	type Me,
	type PrefsAnswer,
	type ProfilePatch,
	type Security,
	type SignInSession,
	type TotpSetup,
} from "../services/account.service";
import { orderSessions, SESSIONS_SHOWN } from "../lib/sessions";

import { type Sheet, ProfileSheet } from "./profile-sheet";
import { SettingsPage, settingsMenu } from "./settings-page";

function reason(cause: unknown, fallback: string): string {
	return cause instanceof Error ? cause.message : fallback;
}

const DAY = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

/**
 * Settings → Profile (Figma 24): how you appear to teammates and agents — your photo, name,
 * username, email and time zone; who your agents commit as; how you sign in; and where you are
 * signed in. Every change saves as it is made.
 */
export function ProfileScreen(): JSX.Element {
	const auth = useAuth();
	const workspaces = useWorkspaces();
	const [me, setMe] = createSignal<Me | null>(null);
	const [security, setSecurity] = createSignal<Security | null>(null);
	const [sessions, setSessions] = createSignal<SignInSession[] | null>(null);
	const [allSessions, setAllSessions] = createSignal(false);
	const shownSessions = () => {
		const ordered = orderSessions(sessions() ?? []);
		return allSessions() ? ordered : ordered.slice(0, SESSIONS_SHOWN);
	};
	const [prefs, setPrefs] = createSignal<PrefsAnswer | null>(null);
	const [error, setError] = createSignal<string | null>(null);
	const [changingPassword, setChangingPassword] = createSignal(false);
	const [twoFactor, setTwoFactor] = createSignal<"on" | "off" | null>(null);
	const [sheet, setSheet] = createSignal<Sheet | null>(null);
	const shell = useShell();
	let photo: HTMLInputElement | undefined;

	const token = () => auth.token();
	const name = () => me()?.profile.displayName || me()?.username || "";
	const zone = () => me()?.profile.timezone || LOCAL_ZONE;

	async function load(): Promise<void> {
		const current = untrack(token);
		if (!current) return;
		try {
			const [person, secure, signedIn] = await Promise.all([
				accountService.me(current),
				accountService.security(current),
				accountService.sessions(current),
			]);
			setMe(person);
			setSecurity(secure);
			setSessions(signedIn);
			setError(null);
		} catch (cause) {
			setError(reason(cause, "Could not read your profile"));
		}
		// The runner keeps who agents commit as; an older one without it leaves the section out.
		accountService.prefs(current).then(setPrefs, () => setPrefs(null));
	}
	createEffect(token, (current) => {
		if (current) void load();
	});

	// Agents commit as you: the runner learns your name and email from here.
	createEffect(
		() => [me(), prefs()] as const,
		([person, saved]) => {
			const current = untrack(token);
			if (!person || !saved || !current) return;
			const want = { name: person.profile.displayName || person.username, email: person.email };
			if (saved.prefs.git.name === want.name && saved.prefs.git.email === want.email) return;
			accountService.updatePrefs(current, { git: want }).then(setPrefs, () => undefined);
		},
	);

	async function saveProfile(patch: ProfilePatch, what: string): Promise<void> {
		const current = token();
		if (!current) return;
		try {
			setMe(await accountService.updateProfile(current, patch));
		} catch (cause) {
			notify({ title: `${what} was not saved`, description: reason(cause, "Try again") });
		}
	}

	async function savePrefs(patch: Parameters<typeof accountService.updatePrefs>[1]) {
		const current = token();
		if (!current) return;
		try {
			setPrefs(await accountService.updatePrefs(current, patch));
		} catch (cause) {
			notify({ title: "Not saved", description: reason(cause, "Try again") });
		}
	}

	async function uploadPhoto(file: File): Promise<void> {
		const current = token();
		if (!current) return;
		try {
			setMe(await accountService.uploadAvatar(current, file));
			notify({ title: "Photo changed" });
		} catch (cause) {
			notify({ title: "Photo not changed", description: reason(cause, "Try another image") });
		}
	}

	async function addPasskey(): Promise<void> {
		const current = token();
		if (!current) return;
		try {
			const { challengeId, options } = await accountService.beginPasskey(current);
			const response = await createPasskey(options);
			await accountService.finishPasskey(current, {
				challengeId,
				name: deviceName(navigator.userAgent),
				response,
			});
			setSecurity(await accountService.security(current));
			notify({ title: "Passkey added" });
		} catch (cause) {
			notify({ title: "No passkey added", description: reason(cause, "Try again") });
		}
	}

	async function signOut(session: SignInSession): Promise<void> {
		const current = token();
		if (!current) return;
		try {
			await accountService.revokeSession(current, session.id);
			setSessions((list) => list?.filter((item) => item.id !== session.id) ?? null);
		} catch (cause) {
			notify({ title: "Not signed out", description: reason(cause, "Try again") });
		}
	}

	async function signOutOthers(): Promise<void> {
		const others = (sessions() ?? []).filter((session) => !session.isCurrent);
		for (const session of others) await signOut(session);
		if (others.length) notify({ title: "Signed out everywhere else" });
	}

	const roleLine = () => {
		const current = workspaces.current();
		return [current ? ROLE_LABEL[current.role] : null, me()?.email].filter(Boolean).join(" · ");
	};
	const subtitle = () => {
		const current = workspaces.current();
		return current ? `${ROLE_LABEL[current.role]} · ${current.name}` : undefined;
	};
	const keyLine = () => {
		const key = prefs()?.signingKey;
		return key
			? `SSH key · ${key.type} · added ${DAY.format(new Date(key.addedAt))}`
			: "No SSH key on this machine";
	};

	/** Phones (Figma Profile — Mobile): each detail opens a sheet; the toggles stay in place. */
	const phone = (person: Me) => (
		<>
			<IdentityCard
				mark={<Avatar name={name()} src={person.profile.avatarUrl} size="xl" />}
				name={name()}
				meta={person.email}
				action={
					<LinkButton tone="accent" onClick={() => setSheet("edit")}>
						Edit
					</LinkButton>
				}
			/>
			<SettingsGroup title="Details">
				<SettingsLinkRow
					label="Username"
					value={`@${person.username}`}
					onClick={() => setSheet("username")}
				/>
				<SettingsLinkRow
					label="Email"
					value={person.emailVerified ? "Verified" : "Not verified"}
					onClick={() => setSheet("email")}
				/>
				<SettingsLinkRow label="Timezone" value={zone()} onClick={() => setSheet("timezone")} />
			</SettingsGroup>
			<Show when={prefs()}>
				{(saved) => (
					<SettingsGroup title="Git identity">
						<SettingsRow
							inline
							label="Credit the agent"
							description="Co-authored-by on each commit"
						>
							<Switch
								label="Credit the agent"
								checked={saved().prefs.git.creditAgent}
								onChange={(creditAgent) => void savePrefs({ git: { creditAgent } })}
							/>
						</SettingsRow>
						<SettingsRow
							inline
							label="Sign commits"
							description={
								saved().signingKey ? `SSH key · ${saved().signingKey?.type}` : "No SSH key here"
							}
						>
							<Switch
								label="Sign commits"
								checked={saved().prefs.git.signCommits && Boolean(saved().signingKey)}
								disabled={!saved().signingKey}
								onChange={(signCommits) => void savePrefs({ git: { signCommits } })}
							/>
						</SettingsRow>
					</SettingsGroup>
				)}
			</Show>
			<SettingsGroup title="Sign-in">
				<SettingsRow inline label="Two-factor" description="Authenticator app">
					<Switch
						label="Two-factor"
						checked={security()?.mfa.totpEnabled ?? false}
						disabled={!security()}
						onChange={(on) => setTwoFactor(on ? "on" : "off")}
					/>
				</SettingsRow>
				<Show when={person.hasPassword}>
					<SettingsLinkRow
						label="Password"
						value={person.passwordChangedAt ? ago(person.passwordChangedAt) : undefined}
						onClick={() => setChangingPassword(true)}
					/>
				</Show>
				<SettingsLinkRow
					label="Passkeys"
					value={String(security()?.passkeys.length ?? 0)}
					onClick={() => setSheet("passkeys")}
				/>
				<SettingsLinkRow
					label="Sessions"
					value={`${sessions()?.length ?? 0} device${sessions()?.length === 1 ? "" : "s"}`}
					onClick={() => setSheet("sessions")}
				/>
			</SettingsGroup>
		</>
	);

	return (
		<SettingsPage
			title="Profile"
			description={`How you appear to teammates and agents in ${workspaces.current()?.name ?? "Grid"}.`}
			subtitle={subtitle()}
			menu={settingsMenu(
				"Profile",
				[{ items: [{ id: "sign-out", label: "Sign out", danger: true }] }],
				() => void auth.logout(),
			)}
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
			<Show
				when={me()}
				fallback={
					<Show when={!error()}>
						<Stack gap={3}>
							<Skeleton class="h-20" />
							<Skeleton class="h-48" />
						</Stack>
					</Show>
				}
			>
				{(person) => (
					<Show when={shell.desktop()} fallback={phone(person())}>
						<IdentityCard
							mark={<Avatar name={name()} src={person().profile.avatarUrl} size="xl" />}
							name={name()}
							meta={roleLine()}
							action={
								<Button size="sm" onClick={() => photo?.click()}>
									Change photo
								</Button>
							}
						/>

						<SettingsGroup
							title="Details"
							description="Teammates see this on tasks, notes and reviews."
						>
							<SettingsRow label="Name">
								<PillInput
									icon={<UserIcon />}
									aria-label="Name"
									maxlength={100}
									value={person().profile.displayName ?? ""}
									placeholder={person().username}
									onChange={(event) => {
										const value = event.currentTarget.value.trim();
										if (value !== (person().profile.displayName ?? ""))
											void saveProfile({ displayName: value || null }, "Your name");
									}}
								/>
							</SettingsRow>
							<SettingsRow label="Username" description="Used for @mentions">
								<PillInput
									icon={<UserIcon />}
									aria-label="Username"
									maxlength={64}
									value={`@${person().username}`}
									onChange={(event) => {
										const value = event.currentTarget.value.replace(/^@/, "").trim().toLowerCase();
										if (value && value !== person().username)
											void saveProfile({ username: value }, "Your username");
										else event.currentTarget.value = `@${person().username}`;
									}}
								/>
							</SettingsRow>
							<SettingsRow inline label="Email">
								<Text tone="subtle" truncate>
									{person().email}
								</Text>
								<Show
									when={person().emailVerified}
									fallback={<Badge tone="warning">Not verified</Badge>}
								>
									<Badge tone="success">Verified</Badge>
								</Show>
							</SettingsRow>
							<SettingsRow label="Timezone" description="Quiet hours and run times use this">
								<Select
									look="pill"
									label="Timezone"
									value={zone()}
									onChange={(timezone) => void saveProfile({ timezone }, "Your timezone")}
									groups={[
										{
											options: timeZones().map((value) => ({
												value,
												label: `${value} · ${zoneOffset(value)}`,
											})),
										},
									]}
								/>
							</SettingsRow>
						</SettingsGroup>

						<Show when={prefs()}>
							{(saved) => (
								<SettingsGroup
									title="Git identity"
									description="Agents commit as you, so every change has a person behind it."
								>
									<SettingsRow inline label="Commit as">
										<MonoValue>
											{name()} &lt;{person().email}&gt;
										</MonoValue>
									</SettingsRow>
									<SettingsRow
										inline
										label="Credit the agent"
										description="Adds a Co-authored-by line to each commit"
									>
										<Switch
											label="Credit the agent"
											checked={saved().prefs.git.creditAgent}
											onChange={(creditAgent) => void savePrefs({ git: { creditAgent } })}
										/>
									</SettingsRow>
									<SettingsRow inline label="Sign commits" description={keyLine()}>
										<Switch
											label="Sign commits"
											checked={saved().prefs.git.signCommits && Boolean(saved().signingKey)}
											disabled={!saved().signingKey}
											onChange={(signCommits) => void savePrefs({ git: { signCommits } })}
										/>
									</SettingsRow>
								</SettingsGroup>
							)}
						</Show>

						<SettingsGroup title="Sign-in" description="Keep your account and your agents safe.">
							<SettingsRow
								inline
								label="Password"
								description={
									person().passwordChangedAt
										? `Changed ${ago(person().passwordChangedAt as string)}`
										: "You sign in without one"
								}
							>
								<Show when={person().hasPassword}>
									<Button size="sm" onClick={() => setChangingPassword(true)}>
										Change
									</Button>
								</Show>
							</SettingsRow>
							<SettingsRow inline label="Two-factor" description="Authenticator app">
								<Switch
									label="Two-factor"
									checked={security()?.mfa.totpEnabled ?? false}
									disabled={!security()}
									onChange={(on) => setTwoFactor(on ? "on" : "off")}
								/>
							</SettingsRow>
							<SettingsRow
								inline
								label="Passkeys"
								description={
									security()?.passkeys.length
										? security()
												?.passkeys.map((passkey) => passkey.name)
												.join(" · ")
										: "Sign in with your fingerprint or face"
								}
							>
								<Show when={passkeysSupported()}>
									<Button size="sm" onClick={() => void addPasskey()}>
										Add
									</Button>
								</Show>
							</SettingsRow>
						</SettingsGroup>

						<SettingsGroup
							title="Sessions"
							action={
								<Show when={(sessions() ?? []).some((session) => !session.isCurrent)}>
									<Button size="sm" onClick={() => void signOutOthers()}>
										Sign out others
									</Button>
								</Show>
							}
						>
							<Show
								when={sessions()}
								fallback={
									<div class="p-4">
										<Spinner label="Reading sessions" />
									</div>
								}
							>
								<For each={shownSessions()}>
									{(session) => (
										<SettingsRow
											inline
											leading={<LaptopIcon />}
											label={deviceName(session.userAgent)}
											description={[
												session.ipAddress,
												session.isCurrent ? "active now" : ago(session.lastUsedAt),
											]
												.filter(Boolean)
												.join(" · ")}
										>
											<Show
												when={!session.isCurrent}
												fallback={<Badge tone="neutral">This device</Badge>}
											>
												<Button size="sm" onClick={() => void signOut(session)}>
													Sign out
												</Button>
											</Show>
										</SettingsRow>
									)}
								</For>
								<Show when={!allSessions() && (sessions()?.length ?? 0) > SESSIONS_SHOWN}>
									<div class="px-4 py-3">
										<LinkButton onClick={() => setAllSessions(true)}>
											Show all {sessions()?.length} sessions
										</LinkButton>
									</div>
								</Show>
							</Show>
						</SettingsGroup>
					</Show>
				)}
			</Show>

			<input
				ref={(element) => {
					photo = element;
				}}
				type="file"
				accept="image/png,image/jpeg,image/webp"
				class="sr-only"
				aria-label="Choose a photo"
				onChange={(event) => {
					const file = event.currentTarget.files?.[0];
					if (file) void uploadPhoto(file);
					event.currentTarget.value = "";
				}}
			/>
			<PasswordDialog open={changingPassword()} onClose={() => setChangingPassword(false)} />
			<ProfileSheet
				sheet={sheet()}
				person={me()}
				security={security()}
				sessions={sessions()}
				zone={zone()}
				onClose={() => setSheet(null)}
				onPhoto={() => photo?.click()}
				onSave={(patch, what) => void saveProfile(patch, what)}
				onAddPasskey={() => void addPasskey()}
				onSignOut={(session) => void signOut(session)}
				onSignOutOthers={() => void signOutOthers()}
			/>
			<TwoFactorDialog
				mode={twoFactor()}
				onClose={() => setTwoFactor(null)}
				onChanged={() => {
					const current = token();
					if (current) accountService.security(current).then(setSecurity, () => undefined);
				}}
			/>
		</SettingsPage>
	);
}

/** Changing the password: the current one, then the new one. */
function PasswordDialog(props: { open: boolean; onClose: () => void }): JSX.Element {
	const auth = useAuth();
	const [current, setCurrent] = createSignal("");
	const [next, setNext] = createSignal("");
	const [busy, setBusy] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);
	const close = () => {
		setCurrent("");
		setNext("");
		setError(null);
		props.onClose();
	};
	async function save(): Promise<void> {
		const token = auth.token();
		if (!token || busy()) return;
		setBusy(true);
		setError(null);
		try {
			await accountService.changePassword(token, current(), next());
			notify({ title: "Password changed" });
			close();
		} catch (cause) {
			setError(reason(cause, "Could not change it"));
		} finally {
			setBusy(false);
		}
	}
	return (
		<Dialog
			open={props.open}
			onClose={close}
			title="Change password"
			footer={
				<>
					<Button onClick={close}>Cancel</Button>
					<Button
						variant="primary"
						disabled={busy() || !current() || next().length < 8}
						onClick={() => void save()}
					>
						Change password
					</Button>
				</>
			}
		>
			<Stack gap={4}>
				<Show when={error()}>{(message) => <Alert tone="danger" title={message()} />}</Show>
				<Field label="Current password">
					{(id) => (
						<PasswordInput
							id={id}
							autocomplete="current-password"
							value={current()}
							onInput={(event) => setCurrent(event.currentTarget.value)}
						/>
					)}
				</Field>
				<Field label="New password" hint="At least 8 characters.">
					{(id) => (
						<PasswordInput
							id={id}
							autocomplete="new-password"
							value={next()}
							onInput={(event) => setNext(event.currentTarget.value)}
						/>
					)}
				</Field>
			</Stack>
		</Dialog>
	);
}

/** Turning two-factor on (scan, then a first code) or off (a code proves it is you). */
function TwoFactorDialog(props: {
	mode: "on" | "off" | null;
	onClose: () => void;
	onChanged: () => void;
}): JSX.Element {
	const auth = useAuth();
	const [setup, setSetup] = createSignal<TotpSetup | null>(null);
	const [code, setCode] = createSignal("");
	const [recovery, setRecovery] = createSignal<string[] | null>(null);
	const [busy, setBusy] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);

	createEffect(
		() => props.mode,
		(mode) => {
			setCode("");
			setError(null);
			setRecovery(null);
			setSetup(null);
			const token = untrack(() => auth.token());
			if (mode !== "on" || !token) return;
			accountService
				.beginTotp(token)
				.then(setSetup, (cause) => setError(reason(cause, "Could not start two-factor")));
		},
	);

	async function confirm(): Promise<void> {
		const token = auth.token();
		if (!token || busy()) return;
		setBusy(true);
		setError(null);
		try {
			if (props.mode === "on") {
				setRecovery((await accountService.confirmTotp(token, code())).recoveryCodes);
			} else {
				await accountService.disableTotp(token, code());
				notify({ title: "Two-factor is off" });
				props.onClose();
			}
			props.onChanged();
		} catch (cause) {
			setError(reason(cause, "That code did not work"));
		} finally {
			setBusy(false);
		}
	}

	return (
		<Dialog
			open={props.mode !== null}
			onClose={props.onClose}
			title={props.mode === "off" ? "Turn off two-factor" : "Turn on two-factor"}
			description={
				recovery()
					? "Keep these recovery codes somewhere safe. Each works once if you lose your phone."
					: props.mode === "off"
						? "Enter a code from your authenticator app."
						: "Scan this with your authenticator app, then enter the code it shows."
			}
			footer={
				<Show
					when={!recovery()}
					fallback={
						<Button variant="primary" onClick={props.onClose}>
							Done
						</Button>
					}
				>
					<Button onClick={props.onClose}>Cancel</Button>
					<Button
						variant="primary"
						disabled={busy() || code().length < 6}
						onClick={() => void confirm()}
					>
						{props.mode === "off" ? "Turn off" : "Turn on"}
					</Button>
				</Show>
			}
		>
			<Stack gap={4}>
				<Show when={error()}>{(message) => <Alert tone="danger" title={message()} />}</Show>
				<Show
					when={recovery()}
					fallback={
						<>
							<Show when={props.mode === "on"}>
								<Show when={setup()} fallback={<Spinner label="Preparing" />}>
									{(ready) => (
										<Stack gap={2}>
											<img
												src={ready().qrCodeDataUrl}
												alt="QR code for your authenticator app"
												class="size-48 self-center"
											/>
											<MonoValue>{ready().secret}</MonoValue>
										</Stack>
									)}
								</Show>
							</Show>
							<Field label="Code">
								{(id) => (
									<Input
										id={id}
										inputmode="numeric"
										autocomplete="one-time-code"
										maxlength={8}
										value={code()}
										onInput={(event) => setCode(event.currentTarget.value.trim())}
									/>
								)}
							</Field>
						</>
					}
				>
					{(codes) => (
						<div class="grid grid-cols-2 gap-2">
							<For each={codes()}>{(item) => <MonoValue>{item}</MonoValue>}</For>
						</div>
					)}
				</Show>
			</Stack>
		</Dialog>
	);
}
