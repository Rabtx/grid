import type { JSX } from "@solidjs/web";
import { createSignal, onSettled, Show } from "solid-js";

import { Alert, Spinner, Text } from "@/kit";
import { useAuth } from "@/modules/auth";
import { type GitHubStatus, githubService } from "@/modules/environments/services/github.service";
import { GitHubSignIn } from "@/modules/github";

// While a sign-in waits for approval on github.com, look again this often.
const PENDING_POLL_MS = 3_000;

/**
 * GitHub through the GitHub CLI on the machine Grid runs on: who it is signed in as, or the
 * sign-in (a code to approve on github.com). Says when it is ready to use.
 */
export function GithubCli(props: { onReady: (ready: boolean) => void }): JSX.Element {
	const auth = useAuth();
	const [status, setStatus] = createSignal<GitHubStatus | null>(null);
	const [busy, setBusy] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);
	let timer: ReturnType<typeof setTimeout> | undefined;
	let stopped = false;

	const ready = () => status()?.claimedBy === "you" && Boolean(status()?.login);

	async function refresh(): Promise<void> {
		const token = auth.token();
		if (!token) return;
		let next: GitHubStatus | null = null;
		try {
			next = await githubService.status(token);
			setStatus(next);
			// From what came back: the signal settles after this function has moved on.
			props.onReady(next.claimedBy === "you" && Boolean(next.login));
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not reach GitHub");
		}
		clearTimeout(timer);
		if (!stopped && next?.pending) timer = setTimeout(() => void refresh(), PENDING_POLL_MS);
	}

	onSettled(() => {
		void refresh();
		return () => {
			stopped = true;
			clearTimeout(timer);
		};
	});

	async function signIn(): Promise<void> {
		const token = auth.token();
		if (!token || busy()) return;
		setBusy(true);
		setError(null);
		try {
			setStatus(await githubService.signIn(token));
			await refresh();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "GitHub did not answer");
		} finally {
			setBusy(false);
		}
	}

	return (
		<>
			<Show when={error()}>{(message) => <Alert tone="danger" title={message()} />}</Show>
			<Show when={status()} fallback={<Spinner label="Checking GitHub on this machine" />}>
				{(current) => (
					<Show
						when={ready()}
						fallback={
							<GitHubSignIn
								status={current()}
								busy={busy()}
								purpose="to connect GitHub"
								onSignIn={() => void signIn()}
							/>
						}
					>
						<Text tone="subtle">
							Signed in as @{current().login} on this machine. Grid asks the GitHub CLI for a token
							each time; nothing is copied.
						</Text>
					</Show>
				)}
			</Show>
		</>
	);
}
