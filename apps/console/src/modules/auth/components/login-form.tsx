import { useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createSignal, Show } from "solid-js";

import { Button, ErrorNotice, Field, Input } from "@/ui";

import { useAuth } from "../context/auth-context";

export function LoginForm(): JSX.Element {
	const auth = useAuth();
	const navigate = useNavigate();
	const [email, setEmail] = createSignal("");
	const [password, setPassword] = createSignal("");
	const [error, setError] = createSignal<string | null>(null);
	const [pending, setPending] = createSignal(false);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		setError(null);
		setPending(true);
		try {
			await auth.login({ email: email(), password: password() });
			navigate("/board", { replace: true });
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Sign in failed");
		} finally {
			setPending(false);
		}
	}

	return (
		<form class="flex w-full max-w-[22rem] flex-col gap-4" onSubmit={submit}>
			<header class="flex flex-col gap-1">
				<h1 class="font-semibold text-title">Sign in to Grid</h1>
				<p class="text-ink/50 text-ui-sm">Your projects, tasks and agent runs.</p>
			</header>

			<Field label="Email">
				<Input
					type="email"
					required
					autocomplete="email"
					inputmode="email"
					enterkeyhint="next"
					value={email()}
					onInput={(event) => setEmail(event.currentTarget.value)}
				/>
			</Field>

			<Field label="Password">
				<Input
					type="password"
					required
					autocomplete="current-password"
					enterkeyhint="go"
					value={password()}
					onInput={(event) => setPassword(event.currentTarget.value)}
				/>
			</Field>

			<Show when={error()}>{(message) => <ErrorNotice message={message()} />}</Show>

			<Button type="submit" variant="primary" size="lg" disabled={pending()} class="w-full">
				{pending() ? "Signing in…" : "Sign in"}
			</Button>
		</form>
	);
}
