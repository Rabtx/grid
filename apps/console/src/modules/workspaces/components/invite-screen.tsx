import { useParams } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createSignal, Match, onSettled, Show, Switch } from "solid-js";

import {
	Alert,
	Button,
	Field,
	Heading as Title,
	Input,
	PasswordInput,
	Segmented,
	Skeleton,
	SplitLayout,
	Stack,
	Text,
	WorkspacePreview,
} from "@/kit";
import { authService, useAuth } from "@/modules/auth";

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
		<SplitLayout
			aside={(() => {
				// A two-column card only when there is a workspace to show beside the form.
				const current = invite();
				return current ? (
					<WorkspacePreview
						name={current.workspace.name}
						slug={current.workspace.slug}
						color={current.workspace.color}
					/>
				) : undefined;
			})()}
		>
			<Switch
				fallback={
					<Stack gap={3}>
						<Skeleton class="h-7 w-2/3" />
						<Skeleton class="h-4 w-full" />
						<Skeleton class="h-kit-control w-full" />
					</Stack>
				}
			>
				<Match when={invalid()}>
					{(reason) => (
						<Stack gap={2}>
							<Title level={1}>This invite can't be used</Title>
							<Text tone="subtle">{reason()}</Text>
							<Text tone="subtle">Ask whoever sent it for a new link.</Text>
						</Stack>
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
		</SplitLayout>
	);
}

function Heading(props: { invite: InvitePreview; children?: JSX.Element }): JSX.Element {
	return (
		<Stack gap={1}>
			<Title level={1}>Join {props.invite.workspace.name}</Title>
			<Text tone="subtle">
				You're invited as {ROLE_NAMES[props.invite.role]}. {props.children}
			</Text>
		</Stack>
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
		<Stack gap={4}>
			<Heading invite={props.invite}>Signed in as {auth.user()?.email}.</Heading>
			<Show
				when={!otherAccount()}
				fallback={
					<>
						<Text>
							This invite is for {props.invite.email}. Sign out to join with that account.
						</Text>
						<Button variant="secondary" size="lg" class="w-full" onClick={() => void auth.logout()}>
							Sign out
						</Button>
					</>
				}
			>
				<Show when={error()}>{(text) => <Alert tone="danger" title={text()} />}</Show>
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
		</Stack>
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
			{(id) => (
				<Input
					id={id}
					type="email"
					required
					autocomplete="email"
					inputmode="email"
					enterkeyhint="next"
					readonly={props.invite.email !== null}
					value={email()}
					onInput={(event) => setEmail(event.currentTarget.value)}
				/>
			)}
		</Field>
	);

	return (
		<Show
			when={step() !== "code"}
			fallback={
				<form
					onSubmit={(event) => {
						event.preventDefault();
						void confirm();
					}}
				>
					<Stack gap={4}>
						<Stack gap={1}>
							<Title level={1}>Check your email</Title>
							<Text tone="subtle">Enter the code sent to {email()}.</Text>
						</Stack>
						<Field label="Code">
							{(id) => (
								<Input
									id={id}
									required
									autocomplete="one-time-code"
									inputmode="numeric"
									enterkeyhint="go"
									class="font-mono"
									value={code()}
									onInput={(event) => setCode(event.currentTarget.value)}
								/>
							)}
						</Field>
						<Show when={error()}>{(text) => <Alert tone="danger" title={text()} />}</Show>
						<Button type="submit" variant="primary" size="lg" class="w-full" disabled={pending()}>
							{pending() ? "Checking…" : `Confirm and join ${props.invite.workspace.name}`}
						</Button>
					</Stack>
				</form>
			}
		>
			<form
				onSubmit={(event) => {
					event.preventDefault();
					void (step() === "create" ? create() : signIn());
				}}
			>
				<Stack gap={4}>
					<Heading invite={props.invite} />
					<Segmented<"create" | "sign-in">
						label="Account"
						block
						options={[
							{ value: "create", label: "New account" },
							{ value: "sign-in", label: "I have an account" },
						]}
						value={step() === "sign-in" ? "sign-in" : "create"}
						onChange={(next) => {
							setError(null);
							setStep(next);
						}}
					/>
					{emailField}
					<Show when={step() === "create"}>
						<Field label="Username" hint="Lowercase letters, numbers, dots, dashes.">
							{(id) => (
								<Input
									id={id}
									required
									minlength={3}
									autocomplete="username"
									autocapitalize="off"
									enterkeyhint="next"
									value={username()}
									onInput={(event) => setUsername(event.currentTarget.value)}
								/>
							)}
						</Field>
					</Show>
					<Field
						label="Password"
						hint={step() === "create" ? "At least 12 characters." : undefined}
					>
						{(id) => (
							<PasswordInput
								id={id}
								required
								minlength={step() === "create" ? 12 : 1}
								autocomplete={step() === "create" ? "new-password" : "current-password"}
								enterkeyhint="go"
								value={password()}
								onInput={(event) => setPassword(event.currentTarget.value)}
							/>
						)}
					</Field>
					<Show when={error()}>{(text) => <Alert tone="danger" title={text()} />}</Show>
					<Button type="submit" variant="primary" size="lg" class="w-full" disabled={pending()}>
						{pending()
							? step() === "create"
								? "Creating account…"
								: "Signing in…"
							: `Join ${props.invite.workspace.name}`}
					</Button>
				</Stack>
			</form>
		</Show>
	);
}
