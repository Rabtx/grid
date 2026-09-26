import ViewIcon from "@hugeicons/core-free-icons/ViewIcon";
import ViewOffIcon from "@hugeicons/core-free-icons/ViewOffIcon";
import { useLocation, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, onSettled, Show } from "solid-js";

import { Button, ErrorNotice, Field, Icon, IconButton, Input } from "@/ui";

import { useAuth } from "../context/auth-context";
import { authService } from "../services/auth.service";

export function LoginForm(): JSX.Element {
	const auth = useAuth();
	const navigate = useNavigate();
	const location = useLocation();
	const [showPassword, setShowPassword] = createSignal(false);
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

			<div class="relative">
				<Field label="Password">
					<Input
						type={showPassword() ? "text" : "password"}
						required
						autocomplete="current-password"
						enterkeyhint="go"
						class="pr-12"
						value={password()}
						onInput={(event) => setPassword(event.currentTarget.value)}
					/>
				</Field>
				<IconButton
					label={showPassword() ? "Hide password" : "Show password"}
					aria-pressed={showPassword() ? "true" : "false"}
					class="absolute right-0 bottom-0 min-h-11 min-w-11 md:min-h-9 md:min-w-9 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
					onClick={() => setShowPassword((shown) => !shown)}
				>
					<Icon icon={showPassword() ? ViewOffIcon : ViewIcon} />
				</IconButton>
			</div>

			<Show when={setupNeeded()}>
				<p class="text-ink/60 text-ui-sm">
					This Grid isn't set up yet. Open the setup link it printed when it started.
				</p>
			</Show>

			<Show when={error()}>{(message) => <ErrorNotice message={message()} />}</Show>

			<Button type="submit" variant="primary" size="lg" disabled={pending()} class="w-full">
				{pending() ? "Signing in…" : "Sign in"}
			</Button>
		</form>
	);
}
