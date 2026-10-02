import { useLocation, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, onSettled, Show } from "solid-js";

import {
	Alert,
	AuthCard,
	AuthHead,
	Button,
	Field,
	Input,
	KeyIcon,
	LinkButton,
	PasswordInput,
	Text,
} from "@/kit";
import { ApiError } from "@/lib/api-client";
import { passkeysSupported } from "@/lib/webauthn";

import { useAuth } from "../context/auth-context";
import { authService } from "../services/auth.service";
import type { TwoFactorChallenge } from "../types/auth.types";

type Step = "email" | "password" | "code";

/** "or" between two ways in, on a hairline. */
function Or(): JSX.Element {
	return (
		<div class="flex items-center gap-3" aria-hidden="true">
			<span class="h-px flex-1 bg-line" />
			<span class="text-caption text-fg-subtle">or</span>
			<span class="h-px flex-1 bg-line" />
		</div>
	);
}

/**
 * Signing in (Figma 02 · Sign in): the email first, then the password for it, then a second
 * factor when the account has one. A passkey on this device signs in from the first step.
 */
export function LoginForm(): JSX.Element {
	const auth = useAuth();
	const navigate = useNavigate();
	const location = useLocation();
	// Both a restored session and a new login take the same validated return path.
	createEffect(
		() => (auth.ready() && auth.token() ? location.search : null),
		(search) => {
			if (search === null) return;
			const next = new URLSearchParams(search).get("next") ?? "/";
			const safe =
				next.startsWith("/") &&
				!next.startsWith("//") &&
				!next.includes("\\") &&
				!/\s/.test(next) &&
				new URL(next, window.location.origin).origin === window.location.origin;
			navigate(safe ? next : "/", { replace: true });
		},
	);
	const [step, setStep] = createSignal<Step>("email");
	const [email, setEmail] = createSignal("");
	const [password, setPassword] = createSignal("");
	const [error, setError] = createSignal<string | null>(null);
	const [pending, setPending] = createSignal(false);
	// A Grid nobody has set up yet has no accounts to sign in to: point at the setup link instead.
	const [setupNeeded, setSetupNeeded] = createSignal(false);
	// Set once the password is right and the account asks for a second factor.
	const [challenge, setChallenge] = createSignal<TwoFactorChallenge | null>(null);
	const [code, setCode] = createSignal("");
	onSettled(() => {
		authService
			.instance()
			.then((status) => setSetupNeeded(status.setupNeeded))
			.catch(() => {
				// Unknown (offline, say): the form works as before.
			});
	});

	async function run(action: () => Promise<void>, fallback: string): Promise<void> {
		setError(null);
		setPending(true);
		try {
			await action();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : fallback);
		} finally {
			setPending(false);
		}
	}

	function toPassword(event: SubmitEvent): void {
		event.preventDefault();
		setError(null);
		setStep("password");
	}

	function signIn(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		return run(async () => {
			const held = await auth.login({ email: email(), password: password() });
			if (held) {
				setChallenge(held);
				setStep("code");
			}
		}, "Sign in failed");
	}

	function verify(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		const held = challenge();
		if (!held) return Promise.resolve();
		// A wrong or spent code leaves the challenge standing, so another can be typed.
		return run(
			() => auth.verifyTwoFactor({ challengeToken: held.challengeToken, code: code().trim() }),
			"That code was not accepted",
		);
	}

	// Every passkey Grid makes is discoverable, so the device offers its own: no email is sent,
	// which also keeps this button from telling anyone which emails have accounts.
	function passkey(): Promise<void> {
		return run(async () => {
			try {
				await auth.signInWithPasskey();
			} catch (cause) {
				if (cause instanceof ApiError && cause.code === "PASSKEY_INVALID") {
					throw new Error("That passkey isn't for an account here. Continue with your email.");
				}
				throw cause;
			}
		}, "Passkey sign-in failed");
	}

	/** Back to the first step, so a wrong account can be replaced. */
	function startOver(): void {
		setChallenge(null);
		setCode("");
		setPassword("");
		setError(null);
		setStep("email");
	}

	const errorAlert = () => (
		<Show when={error()}>{(message) => <Alert tone="danger" title={message()} />}</Show>
	);

	return (
		<AuthCard>
			<Show when={step() === "email"}>
				<form class="flex flex-col gap-6" onSubmit={toPassword}>
					<AuthHead mark title="Sign in to Grid">
						Welcome back. Your agents kept working.
					</AuthHead>
					<Field label="Email" pill>
						{(id) => (
							<Input
								id={id}
								shape="pill"
								type="email"
								required
								autofocus
								placeholder="you@company.com"
								autocomplete="username"
								inputmode="email"
								enterkeyhint="next"
								value={email()}
								onInput={(event) => setEmail(event.currentTarget.value)}
							/>
						)}
					</Field>
					<Show when={setupNeeded()}>
						<Alert tone="accent" title="This Grid isn't set up yet">
							Open the setup link it printed when it started.
						</Alert>
					</Show>
					{errorAlert()}
					<div class="flex flex-col gap-3">
						<Button type="submit" variant="primary" size="xl" class="w-full">
							Continue
						</Button>
						<Show when={passkeysSupported()}>
							<Or />
							<Button
								type="button"
								size="xl"
								icon={<KeyIcon size="sm" />}
								disabled={pending()}
								onClick={() => void passkey()}
								class="w-full"
							>
								{pending() ? "Waiting for your passkey…" : "Sign in with a passkey"}
							</Button>
						</Show>
					</div>
					<Text tone="subtle" class="md:text-center">
						No account? Ask a workspace owner for an invite.
					</Text>
				</form>
			</Show>

			<Show when={step() === "password"}>
				<form class="flex flex-col gap-6" onSubmit={signIn}>
					{/* The account, for password managers to fill and save beside the password. */}
					<input
						type="email"
						autocomplete="username"
						value={email()}
						readonly
						hidden
						aria-hidden="true"
						tabindex={-1}
					/>
					<AuthHead mark title="Enter your password">
						Signing in as <span class="text-fg">{email()}</span>.{" "}
						<LinkButton tone="accent" onClick={startOver} class="text-body-lg">
							Change
						</LinkButton>
					</AuthHead>
					<Field label="Password" pill>
						{(id) => (
							<PasswordInput
								id={id}
								shape="pill"
								required
								autofocus
								autocomplete="current-password"
								enterkeyhint="go"
								value={password()}
								onInput={(event) => setPassword(event.currentTarget.value)}
							/>
						)}
					</Field>
					{errorAlert()}
					<Button type="submit" variant="primary" size="xl" disabled={pending()} class="w-full">
						{pending() ? "Signing in…" : "Sign in"}
					</Button>
				</form>
			</Show>

			<Show when={step() === "code"}>
				<form class="flex flex-col gap-6" onSubmit={verify}>
					<AuthHead mark title="Two-factor code">
						Enter the code from your authenticator app for <span class="text-fg">{email()}</span>,
						or one of your recovery codes.
					</AuthHead>
					<Field label="Code" pill hint="Six digits, or a recovery code like 1a2b3c4d-5e6f7a8b.">
						{(id) => (
							<Input
								id={id}
								shape="pill"
								required
								autofocus
								autocomplete="one-time-code"
								inputmode="text"
								spellcheck={false}
								enterkeyhint="go"
								value={code()}
								onInput={(event) => setCode(event.currentTarget.value)}
							/>
						)}
					</Field>
					{errorAlert()}
					<div class="flex flex-col gap-3">
						<Button type="submit" variant="primary" size="xl" disabled={pending()} class="w-full">
							{pending() ? "Checking…" : "Verify"}
						</Button>
						<Button
							type="button"
							variant="ghost"
							disabled={pending()}
							onClick={startOver}
							class="w-full"
						>
							Use a different account
						</Button>
					</div>
				</form>
			</Show>
		</AuthCard>
	);
}
