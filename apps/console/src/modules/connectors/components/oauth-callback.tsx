import type { JSX } from "@solidjs/web";
import { createSignal, onSettled, Show } from "solid-js";

import { AuthCard, AuthFrame, AuthHead, Button, Spinner } from "@/kit";

import { connectorsService } from "../services/connectors.service";

type Finish =
	| { status: "working" }
	| { status: "done"; name: string; service: string | null }
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
				({ name, service }) => {
					setFinish({ status: "done", name, service });
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
						when={
							finish().status === "done"
								? (finish() as { name: string; service: string | null })
								: null
						}
						fallback={
							<AuthHead title="Not connected" mark>
								{(finish() as { message: string }).message}
							</AuthHead>
						}
					>
						{(done) => (
							<>
								<AuthHead title={`Signed in to ${done().name}`} mark>
									Choose what its agents may do to finish connecting it.
								</AuthHead>
								{/* Where the dialog that started this is gone (on a phone, the app itself can open
								    this page in its own window), this picks the connection up where it left off. */}
								<Button
									variant="primary"
									size="lg"
									onClick={() => {
										const service = done().service;
										window.location.assign(
											service
												? `/settings/connectors?resume=${encodeURIComponent(state ?? "")}&service=${encodeURIComponent(service)}`
												: "/settings/connectors",
										);
									}}
								>
									Continue in Grid
								</Button>
							</>
						)}
					</Show>
				</Show>
			</AuthCard>
		</AuthFrame>
	);
}
