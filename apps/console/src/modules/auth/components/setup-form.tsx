import { useLocation } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createSignal, Show } from "solid-js";

import { rememberWorkspace } from "@/lib/active-workspace";
import { AuthCard, Button, ErrorNotice, Field, Input, WorkspacePreview } from "@/ui";

import { useAuth } from "../context/auth-context";
import { slugInput, slugify } from "../lib/slug";

/**
 * First run of a Grid: the link printed when it started carries a one-time code; with it, the
 * person who installed Grid creates their account and their workspace, and is signed in.
 */
export function SetupForm(): JSX.Element {
	const auth = useAuth();
	const location = useLocation();
	const code = () => new URLSearchParams(location.search).get("code") ?? "";

	const [name, setName] = createSignal("");
	const [email, setEmail] = createSignal("");
	const [username, setUsername] = createSignal("");
	const [password, setPassword] = createSignal("");
	const [workspace, setWorkspace] = createSignal("");
	// The slug follows the workspace name until someone edits it.
	const [slug, setSlug] = createSignal<string | null>(null);
	const workspaceSlug = () => slug() ?? slugify(workspace());
	const [error, setError] = createSignal<string | null>(null);
	const [pending, setPending] = createSignal(false);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		setError(null);
		setPending(true);
		try {
			await auth.setUp({
				code: code(),
				email: email(),
				username: username(),
				password: password(),
				displayName: name().trim() || undefined,
				workspace: { name: workspace(), slug: workspaceSlug() },
			});
			// Into the new workspace, at its own URL.
			rememberWorkspace(workspaceSlug());
			window.location.replace(`/${encodeURIComponent(workspaceSlug())}/`);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Setup failed");
		} finally {
			setPending(false);
		}
	}

	return (
		<Show
			when={code()}
			fallback={
				<AuthCard>
					<div class="flex flex-col gap-1">
						<h1 class="font-medium text-title">Set up Grid</h1>
						<p class="text-ink/50 text-ui-sm">
							Open the setup link Grid printed when it started (it is also in setup-link.txt in
							Grid's data folder).
						</p>
					</div>
				</AuthCard>
			}
		>
			<AuthCard aside={<WorkspacePreview name={workspace()} slug={workspaceSlug()} />}>
				<form class="flex w-full flex-col gap-4" onSubmit={submit}>
					<header class="flex flex-col gap-1">
						<h1 class="font-medium text-title">Set up Grid</h1>
						<p class="text-ink/50 text-ui-sm">
							Your account, and the workspace your team works in.
						</p>
					</header>

					<Field label="Your name">
						<Input
							autocomplete="name"
							enterkeyhint="next"
							value={name()}
							onInput={(event) => setName(event.currentTarget.value)}
						/>
					</Field>
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
					<Field label="Username" hint="Lowercase letters, numbers, dots, dashes.">
						<Input
							required
							minlength={3}
							autocomplete="username"
							autocapitalize="off"
							enterkeyhint="next"
							value={username()}
							onInput={(event) => setUsername(event.currentTarget.value)}
						/>
					</Field>
					<Field label="Password" hint="At least 12 characters.">
						<Input
							type="password"
							required
							minlength={12}
							autocomplete="new-password"
							enterkeyhint="next"
							value={password()}
							onInput={(event) => setPassword(event.currentTarget.value)}
						/>
					</Field>
					<Field label="Workspace" hint="Your company or team.">
						<Input
							required
							enterkeyhint="next"
							value={workspace()}
							onInput={(event) => setWorkspace(event.currentTarget.value)}
						/>
					</Field>
					<Field label="Workspace URL" hint={`Links look like /${workspaceSlug() || "acme"}/board`}>
						<Input
							required
							minlength={2}
							autocapitalize="off"
							enterkeyhint="go"
							value={workspaceSlug()}
							onInput={(event) => setSlug(slugInput(event.currentTarget.value))}
						/>
					</Field>

					<Show when={error()}>{(message) => <ErrorNotice message={message()} />}</Show>

					<Button type="submit" variant="primary" size="lg" disabled={pending()} class="w-full">
						{pending() ? "Setting up…" : "Create account and workspace"}
					</Button>
				</form>
			</AuthCard>
		</Show>
	);
}
