import { useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createSignal, onSettled, Show } from "solid-js";

import { Alert, AuthCard, AuthHead, Button, Field, Input, Spinner } from "@/kit";

import { useAuth } from "../context/auth-context";
import type { TwoFactorChallenge } from "../types/auth.types";

/**
 * Where an emailed sign-in link lands (`/magic-link?token=…`): the link signs in once, then the
 * workspace opens. An account with two-factor gives its code here, as after a password.
 */
export function MagicLink(): JSX.Element {
	const auth = useAuth();
	const navigate = useNavigate();
	const [state, setState] = createSignal<"opening" | "code" | "failed">("opening");
	const [error, setError] = createSignal<string | null>(null);
	const [challenge, setChallenge] = createSignal<TwoFactorChallenge | null>(null);
	const [code, setCode] = createSignal("");
	const [pending, setPending] = createSignal(false);

	onSettled(() => {
		const token = new URLSearchParams(window.location.search).get("token");
		// The link works once: it leaves the address bar (and the history) as soon as it is read.
		window.history.replaceState(null, "", window.location.pathname);
		if (!token) {
			setError("This page opens a sign-in link from your email, and there was none.");
			setState("failed");
			return;
		}
		auth
			.signInWithMagicLink(token)
			.then((held) => {
				if (held) {
					setChallenge(held);
					setState("code");
				} else navigate("/", { replace: true });
			})
			.catch((cause: unknown) => {
				setError(cause instanceof Error ? cause.message : "The sign-in link is invalid or expired");
				setState("failed");
			});
	});

	async function verify(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		const held = challenge();
		if (!held) return;
		setError(null);
		setPending(true);
		try {
			await auth.verifyTwoFactor({ challengeToken: held.challengeToken, code: code().trim() });
			navigate("/", { replace: true });
		} catch (cause) {
			// A wrong code leaves the challenge standing, so another can be typed.
			setError(cause instanceof Error ? cause.message : "That code was not accepted");
		} finally {
			setPending(false);
		}
	}

	return (
		<AuthCard>
			<Show when={state() === "opening"}>
				<div class="flex flex-col items-center gap-4 py-6">
					<Spinner label="Signing you in" />
				</div>
			</Show>

			<Show when={state() === "code"}>
				<form class="flex flex-col gap-6" onSubmit={verify}>
					<AuthHead mark title="Two-factor code">
						Enter the code from your authenticator app, or one of your recovery codes.
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
					<Show when={error()}>{(message) => <Alert tone="danger" title={message()} />}</Show>
					<Button type="submit" variant="primary" size="xl" disabled={pending()} class="w-full">
						{pending() ? "Checking…" : "Verify"}
					</Button>
				</form>
			</Show>

			<Show when={state() === "failed"}>
				<div class="flex flex-col gap-6">
					<AuthHead mark title="That link didn't work">
						Sign-in links work once and expire after a few minutes.
					</AuthHead>
					<Show when={error()}>{(message) => <Alert tone="danger" title={message()} />}</Show>
					<Button
						type="button"
						variant="primary"
						size="xl"
						onClick={() => navigate("/login", { replace: true })}
						class="w-full"
					>
						Sign in
					</Button>
				</div>
			</Show>
		</AuthCard>
	);
}
