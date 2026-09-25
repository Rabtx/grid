import { useLocation, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, onSettled, Show } from "solid-js";

import { useAuth } from "@/modules/auth";
import { BrandMark } from "@/ui";

/**
 * Keeps signed-out visitors off the authenticated routes.
 *
 * The redirect waits for `ready()` because the provider spends its first moments
 * trying to trade the refresh cookie for a token; redirecting before that settles
 * would bounce a signed-in user to the login page on every reload. Someone who was signed in on
 * this device last time (`restoring()`) sees their Grid meanwhile, from what the device kept.
 */
export function RequireAuth(props: { children: JSX.Element }): JSX.Element {
	const auth = useAuth();
	const navigate = useNavigate();
	const location = useLocation();

	createEffect(
		() =>
			auth.ready() && !auth.token() && !auth.restoring()
				? location.pathname + location.search
				: null,
		(next) => {
			if (next !== null)
				navigate(`/login?next=${encodeURIComponent(next)}`, {
					replace: true,
				});
		},
	);

	return (
		<Show when={(auth.ready() && auth.token()) || auth.restoring()} fallback={<AuthPending />}>
			{props.children}
		</Show>
	);
}

function AuthPending(): JSX.Element {
	const [visible, setVisible] = createSignal(false);
	onSettled(() => {
		const timer = setTimeout(() => setVisible(true), 300);
		return () => clearTimeout(timer);
	});
	return (
		<Show when={visible()}>
			<output aria-label="Checking your session" class="flex justify-center py-12">
				<BrandMark class="motion-safe:animate-pulse" />
			</output>
		</Show>
	);
}
