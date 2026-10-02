import { useLocation, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, onSettled, Show } from "solid-js";

import { Splash } from "@/kit";
import { activeWorkspace } from "@/lib/active-workspace";
import { bootSplashShown } from "@/lib/boot-splash";
import { useAuth } from "@/modules/auth";

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

/**
 * The splash while the session is checked. It waits 300 ms first, so a quick check never flashes
 * it; a slow one shows the Figma splash naming the workspace being opened.
 */
function AuthPending(): JSX.Element {
	// Straight on when the page is still opening (the static splash was showing), so the two
	// splashes meet without a blank between them; after 300 ms otherwise, so quick checks never flash.
	const [visible, setVisible] = createSignal(bootSplashShown);
	onSettled(() => {
		const timer = setTimeout(() => setVisible(true), 300);
		return () => clearTimeout(timer);
	});
	const workspace = activeWorkspace();
	return (
		<Show when={visible()}>
			<Splash message={workspace ? `Connecting to ${workspace}…` : "Connecting…"} />
		</Show>
	);
}
