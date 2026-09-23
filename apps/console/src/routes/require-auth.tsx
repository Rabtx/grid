import { useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, Show } from "solid-js";

import { useAuth } from "@/modules/auth";

/**
 * Keeps signed-out visitors off the authenticated routes.
 *
 * The redirect waits for `ready()` because the provider spends its first moments
 * trying to trade the refresh cookie for a token; redirecting before that settles
 * would bounce a signed-in user to the login page on every reload.
 */
export function RequireAuth(props: { children: JSX.Element }): JSX.Element {
	const auth = useAuth();
	const navigate = useNavigate();

	createEffect(
		() => auth.ready() && !auth.token(),
		(signedOut) => {
			if (signedOut) navigate("/login", { replace: true });
		},
	);

	return (
		<Show when={auth.ready() && auth.token()} fallback={<AuthPending />}>
			{props.children}
		</Show>
	);
}

function AuthPending(): JSX.Element {
	return <p class="py-12 text-center text-ink/40 text-ui-sm">Checking your session…</p>;
}
