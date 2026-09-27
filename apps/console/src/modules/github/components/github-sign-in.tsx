import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import { Alert, Button, button, Code, CopyField, Spinner, Stack, Text } from "@/kit";
import type { GitHubStatus } from "@/modules/environments/services/github.service";

/**
 * Connecting GitHub: through the GitHub CLI (`gh`) on the machine Grid runs on. A machine already
 * signed in is used as it is; otherwise GitHub hands out a code to approve on github.com, on
 * whatever device the person is using. Grid never stores a GitHub token.
 */
export function GitHubSignIn(props: {
	status: GitHubStatus;
	busy: boolean;
	onSignIn: () => void;
	/** What connecting is for, in the "install gh" line: "to manage Codespaces here". */
	purpose: string;
}): JSX.Element {
	const ready = () => Boolean(props.status.login && props.status.canManageCodespaces);
	return (
		<Show
			when={props.status.installed}
			fallback={
				<Text tone="subtle">
					Install the GitHub CLI (<Code>gh</Code>) on the machine Grid runs on {props.purpose}.
				</Text>
			}
		>
			<Show
				when={props.status.claimedBy !== "someone-else"}
				fallback={<Text tone="subtle">Someone else in this Grid has connected GitHub here.</Text>}
			>
				<Show
					when={props.status.pending}
					fallback={
						<Stack gap={3} align="start">
							<Text tone="subtle">
								<Show
									when={ready()}
									fallback="Sign in once; GitHub gives you a code to approve. Grid never stores your GitHub token."
								>
									This machine is already signed in to GitHub as @{props.status.login}.
								</Show>
							</Text>
							<Show when={props.status.error}>
								{(message) => <Alert tone="danger" title={message()} />}
							</Show>
							<Button variant="primary" disabled={props.busy} onClick={props.onSignIn}>
								{ready() ? `Use @${props.status.login}` : "Sign in with GitHub"}
							</Button>
						</Stack>
					}
				>
					{(pending) => (
						<Stack gap={3}>
							<Text tone="subtle">
								Open GitHub, enter this code and approve. This page carries on by itself.
							</Text>
							<div class="md:max-w-64">
								<CopyField label="GitHub code" value={pending().code} mono />
							</div>
							<div class="flex flex-wrap items-center gap-3">
								<a
									href={pending().url}
									target="_blank"
									rel="noopener noreferrer"
									class={button({ variant: "primary" })}
								>
									Open github.com/login/device
								</a>
								<Spinner label="Waiting for approval" />
								<Text as="span" size="caption" tone="subtle">
									Waiting for approval…
								</Text>
							</div>
						</Stack>
					)}
				</Show>
			</Show>
		</Show>
	);
}
