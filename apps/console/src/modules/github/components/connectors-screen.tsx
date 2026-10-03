import type { JSX } from "@solidjs/web";
import { createSignal, onSettled, Show } from "solid-js";

import { Alert, Badge, Button, SettingsGroup, SettingsRow, Spinner, Text, TextLink } from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";
import { useAuth } from "@/modules/auth";
import { type GitHubStatus, githubService } from "@/modules/environments/services/github.service";
import { SettingsPage } from "@/modules/settings/components/settings-page";

import { GitHubSignIn } from "./github-sign-in";

// While a sign-in waits for approval on github.com, look again this often.
const PENDING_POLL_MS = 3_000;

/**
 * Settings → Connectors: the outside services Grid works with. GitHub first, through the GitHub
 * CLI on the machine Grid runs on: pull requests in every project, and Codespaces as environments.
 */
export function ConnectorsScreen(): JSX.Element {
	const auth = useAuth();
	const [status, setStatus] = createSignal<GitHubStatus | null>(null);
	const [busy, setBusy] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);
	const connected = () => status()?.claimedBy === "you";

	async function refresh(): Promise<void> {
		const token = auth.token();
		if (!token) return;
		try {
			setStatus(await githubService.status(token));
			setError(null);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not reach GitHub");
		}
	}

	// While a sign-in waits for approval on github.com, keep looking until it is done.
	let timer: ReturnType<typeof setTimeout> | undefined;
	let stopped = false;
	function watch(): void {
		clearTimeout(timer);
		if (stopped || !status()?.pending) return;
		timer = setTimeout(() => void refresh().then(watch), PENDING_POLL_MS);
	}

	onSettled(() => {
		void refresh().then(watch);
		return () => {
			stopped = true;
			clearTimeout(timer);
		};
	});

	async function run(work: (token: string) => Promise<unknown>): Promise<void> {
		const token = auth.token();
		if (!token || busy()) return;
		setBusy(true);
		setError(null);
		try {
			await work(token);
			await refresh();
			watch();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "That did not work");
		} finally {
			setBusy(false);
		}
	}

	return (
		<SettingsPage title="Connectors" description="The outside services Grid works with.">
			<Show when={error()}>{(message) => <Alert tone="danger" title={message()} />}</Show>
			<SettingsGroup
				title="GitHub"
				description={
					connected()
						? `Connected as @${status()?.login}`
						: "Pull requests and Codespaces, through the GitHub CLI on this machine."
				}
				action={
					<Show when={connected()}>
						<Button
							variant="ghost"
							size="sm"
							disabled={busy()}
							onClick={() => void run(githubService.signOut)}
						>
							Disconnect
						</Button>
					</Show>
				}
			>
				<Show
					when={status()}
					fallback={
						<div class="px-4 py-3.5">
							<Spinner label="Checking GitHub" />
						</div>
					}
				>
					{(current) => (
						<Show
							when={connected()}
							fallback={
								<div class="px-4 py-4">
									<GitHubSignIn
										status={current()}
										busy={busy()}
										purpose="to connect GitHub"
										onSignIn={() => void run(githubService.signIn)}
									/>
								</div>
							}
						>
							<SettingsRow
								inline
								label="Pull requests"
								description="Open a project, then Pull requests: review, merge and comment from here."
							>
								<Badge tone="success" dot>
									On
								</Badge>
							</SettingsRow>
							<SettingsRow
								inline
								label="Codespaces"
								description="Start, stop and connect Codespaces as environments."
							>
								<TextLink tone="accent" href={workspaceHref("/settings/machines")}>
									Environments
								</TextLink>
							</SettingsRow>
						</Show>
					)}
				</Show>
			</SettingsGroup>
			<Text tone="faint" size="caption">
				Linear, GitLab and Slack come next.
			</Text>
		</SettingsPage>
	);
}
