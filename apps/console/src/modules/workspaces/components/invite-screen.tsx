import { useParams } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createSignal, Match, onSettled, Show, Switch } from "solid-js";

import { authService, useAuth } from "@/modules/auth";
import {
	AuthCard,
	Button,
	ErrorNotice,
	Field,
	Input,
	SegmentedControl,
	Skeleton,
	WorkspacePreview,
} from "@/ui";

import { openWorkspace } from "../context/workspaces-context";
import { workspacesService } from "../services/workspaces.service";
import type { InvitePreview } from "../types/workspace.types";

type Step = "create" | "sign-in" | "code";

const ROLE_NAMES = { owner: "an owner", admin: "an admin", member: "a member" } as const;

function message(cause: unknown, fallback: string): string {
	return cause instanceof Error ? cause.message : fallback;
}

/**
 * An invite link, `/invite/:token`: what it is for, then joining. Signed in, one button joins;
 * signed out, a new account (which joins as it is made) or signing in to an existing one.
 */
export function InviteScreen(): JSX.Element {
	const params = useParams<{ token: string }>();
	const auth = useAuth();
	const [invite, setInvite] = createSignal<InvitePreview | null>(null);
	const [invalid, setInvalid] = createSignal<string | null>(null);

	onSettled(() => {
		workspacesService
			.previewInvite(params.token)
			.then(setInvite)
			.catch((cause: unknown) =>
				setInvalid(message(cause, "This invite link has expired or was already used.")),
			);
	});

	return (
		<AuthCard
			aside={
				<Show when={invite()}>
					{(current) => (
						<WorkspacePreview
							name={current().workspace.name}
							slug={current().workspace.slug}
							color={current().workspace.color}
						/>
					)}
				</Show>
			}
		>
			<Switch
				fallback={
					<div class="flex flex-col gap-3" aria-busy="true">
						<Skeleton class="h-7 w-2/3" />
						<Skeleton class="h-4 w-full" />
						<Skeleton class="h-field w-full" />
					</div>
				}
			>
				<Match when={invalid()}>
					{(reason) => (
						<div class="flex flex-col gap-2">
							<h1 class="font-medium text-title">This invite can't be used</h1>
							<p class="text-ink/55 text-ui-sm">{reason()}</p>
							<p class="text-ink/55 text-ui-sm">Ask whoever sent it for a new link.</p>
						</div>
					)}
				</Match>
				<Match when={invite() && auth.ready() ? invite() : null}>
					{(current) => (
						<Show
							when={auth.token()}
							fallback={<JoinSignedOut invite={current()} token={params.token} />}
						>
							<JoinSignedIn invite={current()} token={params.token} />
						</Show>
					)}
				</Match>
			</Switch>
		</AuthCard>
	);
}

function Heading(props: { invite: InvitePreview; children?: JSX.Element }): JSX.Element {
	return (
		<header class="flex flex-col gap-1">
			<h1 class="font-medium text-title">Join {props.invite.workspace.name}</h1>
			<p class="text-ink/55 text-ui-sm">
				You're invited as {ROLE_NAMES[props.invite.role]}. {props.children}
			</p>
		</header>
	);
}

/** Signed in already: join with this account, unless the invite names another address. */
function JoinSignedIn(props: { invite: InvitePreview; token: string }): JSX.Element {
	const auth = useAuth();
	const [error, setError] = createSignal<string | null>(null);
	const [pending, setPending] = createSignal(false);
	const otherAccount = () =>
		props.invite.email !== null && props.invite.email !== auth.user()?.email.toLowerCase();

	async function join(): Promise<void> {
		setError(null);
		setPending(true);
		try {
			const token = await auth.waitForToken();
			if (!token) throw new Error("Sign in again to join");
			await workspacesService.acceptInvite(props.token, token);
			openWorkspace(props.invite.workspace.slug);
		} catch (cause) {
			setError(message(cause, "Could not join the workspace"));
			setPending(false);
		}
	}

	return (
		<div class="flex flex-col gap-4">
			<Heading invite={props.invite}>Signed in as {auth.user()?.email}.</Heading>
			<Show
				when={!otherAccount()}
				fallback={
					<>
						<p class="text-ink/70 text-ui-sm">
							This invite is for {props.invite.email}. Sign out to join with that account.
						</p>
						<Button variant="secondary" size="lg" class="w-full" onClick={() => void auth.logout()}>
							Sign out
						</Button>
					</>
				}
			>
				<Show when={error()}>{(text) => <ErrorNotice message={text()} />}</Show>
				<Button
					variant="primary"
					size="lg"
					class="w-full"
					disabled={pending()}
					onClick={() => void join()}
				>
					{pending() ? "Joining…" : `Join ${props.invite.workspace.name}`}
				</Button>
			</Show>
		</div>
	);
}

/**
 * Signed out: a new account joins as it is made (confirming the email with a code when the
 * invite did not already prove it); an existing account signs in, then joins.
 */
function JoinSignedOut(props: { invite: InvitePreview; token: string }): JSX.Element {
	const auth = useAuth();
	const [step, setStep] = createSignal<Step>("create");
	const [email, setEmail] = createSignal(props.invite.email ?? "");
	const [username, setUsername] = createSignal("");
	const [password, setPassword] = createSignal("");
	const [code, setCode] = createSignal("");
	const [error, setError] = createSignal<string | null>(null);
	const [pending, setPending] = createSignal(false);

	async function run(action: () => Promise<void>, fallback: string): Promise<void> {
		setError(null);
		setPending(true);
		try {
			await action();
		} catch (cause) {
			setError(message(cause, fallback));
			setPending(false);
		}
	}

	// The new account already joined when it was made; signing in opens the workspace.
	const signInAndOpen = async () => {
		await auth.login({ email: email(), password: password() });
		openWorkspace(props.invite.workspace.slug);
	};

	const create = () =>
		run(async () => {
			const result = await authService.register({
				email: email(),
				username: username(),
				password: password(),
				inviteToken: props.token,
			});
			if (result.user.emailVerified) await signInAndOpen();
			else {
				setStep("code");
				setPending(false);
			}
		}, "Could not create the account");

	const confirm = () =>
		run(async () => {
			await authService.verifyEmail({ email: email(), code: code().trim() });
			await signInAndOpen();
		}, "That code did not work");

	const signIn = () =>
		run(async () => {
			await auth.login({ email: email(), password: password() });
			const token = await auth.waitForToken();
			if (!token) throw new Error("Sign in failed");
			await workspacesService.acceptInvite(props.token, token);
			openWorkspace(props.invite.workspace.slug);
		}, "Sign in failed");

	const emailField = (
		<Field label="Email">
			<Input
				type="email"
				required
				autocomplete="email"
				inputmode="email"
				enterkeyhint="next"
				readonly={props.invite.email !== null}
				value={email()}
				onInput={(event) => setEmail(event.currentTarget.value)}
			/>
		</Field>
	);

	return (
		<Show
			when={step() !== "code"}
			fallback={
				<form
					class="flex flex-col gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						void confirm();
					}}
				>
					<header class="flex flex-col gap-1">
						<h1 class="font-medium text-title">Check your email</h1>
						<p class="text-ink/55 text-ui-sm">Enter the code sent to {email()}.</p>
					</header>
					<Field label="Code">
						<Input
							required
							autocomplete="one-time-code"
							inputmode="numeric"
							enterkeyhint="go"
							value={code()}
							onInput={(event) => setCode(event.currentTarget.value)}
						/>
					</Field>
					<Show when={error()}>{(text) => <ErrorNotice message={text()} />}</Show>
					<Button type="submit" variant="primary" size="lg" class="w-full" disabled={pending()}>
						{pending() ? "Checking…" : `Confirm and join ${props.invite.workspace.name}`}
					</Button>
				</form>
			}
		>
			<form
				class="flex flex-col gap-4"
				onSubmit={(event) => {
					event.preventDefault();
					void (step() === "create" ? create() : signIn());
				}}
			>
				<Heading invite={props.invite} />
				<SegmentedControl
					label="Account"
					options={[
						{ value: "create", label: "New account" },
						{ value: "sign-in", label: "I have an account" },
					]}
					value={step()}
					onChange={(next) => {
						setError(null);
						setStep(next);
					}}
				/>
				{emailField}
				<Show when={step() === "create"}>
					<Field label="Username" hint="Lowercase letters, numbers, dots, dashes.">
						<Input
							required
							minlength={3}
							autocomplete="username"
							autocapitalize="off"
							enterkeyhint="next"
							value={username()}
							onInput={(event) => setUsername(event.currentTarget.value)}
						/>
					</Field>
				</Show>
				<Field label="Password" hint={step() === "create" ? "At least 12 characters." : undefined}>
					<Input
						type="password"
						required
						minlength={step() === "create" ? 12 : 1}
						autocomplete={step() === "create" ? "new-password" : "current-password"}
						enterkeyhint="go"
						value={password()}
						onInput={(event) => setPassword(event.currentTarget.value)}
					/>
				</Field>
				<Show when={error()}>{(text) => <ErrorNotice message={text()} />}</Show>
				<Button type="submit" variant="primary" size="lg" class="w-full" disabled={pending()}>
					{pending()
						? step() === "create"
							? "Creating account…"
							: "Signing in…"
						: `Join ${props.invite.workspace.name}`}
				</Button>
			</form>
		</Show>
	);
}
