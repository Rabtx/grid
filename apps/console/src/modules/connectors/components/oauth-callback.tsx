import type { JSX } from "@solidjs/web";
import { onSettled, Show } from "solid-js";

import { AuthCard, AuthFrame, AuthHead } from "@/kit";

/**
 * Where a connector's sign-in comes back to, in the window it opened in: it hands the code to the
 * console that opened it and closes. Opened any other way, it says to go back.
 */
export function OAuthCallback(): JSX.Element {
	const params = new URLSearchParams(window.location.search);
	const opener = window.opener as Window | null;

	onSettled(() => {
		if (!opener) return;
		opener.postMessage(
			{
				type: "grid-connector-sign-in",
				state: params.get("state"),
				code: params.get("code"),
				error: params.get("error_description") ?? params.get("error"),
			},
			window.location.origin,
		);
		window.close();
	});

	return (
		<AuthFrame>
			<AuthCard>
				<AuthHead title="Signed in" mark>
					<Show when={opener} fallback="Go back to Grid to finish connecting.">
						You can close this window.
					</Show>
				</AuthHead>
			</AuthCard>
		</AuthFrame>
	);
}
