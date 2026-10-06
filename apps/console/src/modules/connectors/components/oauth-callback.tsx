import type { JSX } from "@solidjs/web";
import { createSignal, onSettled, Show } from "solid-js";

import { AuthCard, AuthFrame, AuthHead, Spinner } from "@/kit";

import { connectorsService } from "../services/connectors.service";

type Finish =
	| { status: "working" }
	| { status: "done"; name: string }
	| { status: "failed"; message: string };

/**
 * Where a connector's sign-in comes back to. This page finishes the sign-in itself, with the runner,
 * rather than handing the code to the window that opened it: most sign-in pages cut that link, and
 * on phones the sign-in often opens outside the installed app, where there is no opener at all.
 * The connect dialog sees the result on its own; when this window still has its opener, it is told
 * at once and this window closes.
 */
export function OAuthCallback(): JSX.Element {
	const params = new URLSearchParams(window.location.search);
	const state = params.get("state");
	const [finish, setFinish] = createSignal<Finish>(
		state
			? { status: "working" }
			: { status: "failed", message: "This page did not come from a Grid sign-in." },
	);

	onSettled(() => {
		if (!state) return;
		const opener = window.opener as Window | null;
		const tell = () =>
			opener?.postMessage({ type: "grid-connector-sign-in", state }, window.location.origin);
		void connectorsService
			.completeSignIn({
				state,
				code: params.get("code"),
				error: params.get("error_description") ?? params.get("error"),
			})
			.then(
				({ name }) => {
					setFinish({ status: "done", name });
					tell();
					if (opener) window.close();
				},
				(cause: unknown) => {
					setFinish({
						status: "failed",
						message: cause instanceof Error ? cause.message : "Signing in failed",
					});
					tell();
				},
			);
	});

	return (
		<AuthFrame>
			<AuthCard>
				<Show
					when={finish().status !== "working"}
					fallback={
						<AuthHead title="Finishing the sign-in" mark>
							<Spinner label="Finishing the sign-in" />
						</AuthHead>
					}
				>
					<Show
						when={finish().status === "done" ? (finish() as { name: string }) : null}
						fallback={
							<AuthHead title="Not connected" mark>
								{(finish() as { message: string }).message}
							</AuthHead>
						}
					>
						{(done) => (
							<AuthHead title={`Signed in to ${done().name}`} mark>
								Go back to Grid to choose what its agents may do. You can close this window.
							</AuthHead>
						)}
					</Show>
				</Show>
			</AuthCard>
		</AuthFrame>
	);
}
