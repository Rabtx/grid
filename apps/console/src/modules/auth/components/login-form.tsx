import { useLocation, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, onSettled, Show } from "solid-js";

import { Alert, Button, Field, Heading, Input, PasswordInput, Stack, Text } from "@/kit";

import { useAuth } from "../context/auth-context";
import { authService } from "../services/auth.service";

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
	const [email, setEmail] = createSignal("");
	const [password, setPassword] = createSignal("");
	const [error, setError] = createSignal<string | null>(null);
	const [pending, setPending] = createSignal(false);
	// A Grid nobody has set up yet has no accounts to sign in to: point at the setup link instead.
	const [setupNeeded, setSetupNeeded] = createSignal(false);
	onSettled(() => {
		authService
			.instance()
			.then((status) => setSetupNeeded(status.setupNeeded))
			.catch(() => {
				// Unknown (offline, say): the form works as before.
			});
	});

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		setError(null);
		setPending(true);
		try {
			await auth.login({ email: email(), password: password() });
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Sign in failed");
		} finally {
			setPending(false);
		}
	}

	return (
		<form class="w-full" onSubmit={submit}>
			<Stack gap={4}>
				<Stack gap={1}>
					<Heading level={1}>Sign in to Grid</Heading>
					<Text tone="subtle">Welcome back. Your workspaces are where you left them.</Text>
				</Stack>

				<Field label="Email">
					{(id) => (
						<Input
							id={id}
							type="email"
							required
							autocomplete="email"
							inputmode="email"
							enterkeyhint="next"
							value={email()}
							onInput={(event) => setEmail(event.currentTarget.value)}
						/>
					)}
				</Field>

				<Field label="Password">
					{(id) => (
						<PasswordInput
							id={id}
							required
							autocomplete="current-password"
							enterkeyhint="go"
							value={password()}
							onInput={(event) => setPassword(event.currentTarget.value)}
						/>
					)}
				</Field>

				<Show when={setupNeeded()}>
					<Alert tone="accent" title="This Grid isn't set up yet">
						Open the setup link it printed when it started.
					</Alert>
				</Show>

				<Show when={error()}>{(message) => <Alert tone="danger" title={message()} />}</Show>

				<Button type="submit" variant="primary" size="lg" disabled={pending()} class="w-full">
					{pending() ? "Signing in…" : "Sign in"}
				</Button>
			</Stack>
		</form>
	);
}
