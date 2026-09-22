import { useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createSignal, Show } from "solid-js";

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
		<form class="w-full max-w-sm space-y-4" onSubmit={submit}>
			<header class="space-y-1">
				<h1 class="font-semibold text-2xl tracking-tight">Sign in to Grid</h1>
				<p class="text-muted-foreground text-sm">Your projects, tasks and agent runs.</p>
			</header>

			<label class="block space-y-1.5">
				<span class="font-medium text-sm">Email</span>
				<input
					type="email"
					required
					autocomplete="email"
					value={email()}
					onInput={(event) => setEmail(event.currentTarget.value)}
					class="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-ring"
				/>
			</label>

			<label class="block space-y-1.5">
				<span class="font-medium text-sm">Password</span>
				<input
					type="password"
					required
					autocomplete="current-password"
					value={password()}
					onInput={(event) => setPassword(event.currentTarget.value)}
					class="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-ring"
				/>
			</label>

			<Show when={error()}>{(message) => <p class="text-destructive text-sm">{message()}</p>}</Show>

			<button
				type="submit"
				disabled={pending()}
				class="h-9 w-full rounded-md bg-primary font-medium text-primary-foreground text-sm disabled:opacity-60"
			>
				{pending() ? "Signing in…" : "Sign in"}
			</button>
		</form>
	);
}
