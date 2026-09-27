import { useLocation } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createSignal, Show } from "solid-js";

import { rememberWorkspace } from "@/lib/active-workspace";
import {
	Alert,
	Button,
	Field,
	Heading,
	Input,
	PasswordInput,
	SplitLayout,
	Stack,
	Text,
	WorkspacePreview,
} from "@/kit";

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
				<SplitLayout>
					<Stack gap={1}>
						<Heading level={1}>Set up Grid</Heading>
						<Text tone="subtle">
							Open the setup link Grid printed when it started (it is also in setup-link.txt in
							Grid's data folder).
						</Text>
					</Stack>
				</SplitLayout>
			}
		>
			<SplitLayout aside={<WorkspacePreview name={workspace()} slug={workspaceSlug()} />}>
				<form class="w-full" onSubmit={submit}>
					<Stack gap={4}>
						<Stack gap={1}>
							<Heading level={1}>Set up Grid</Heading>
							<Text tone="subtle">Your account, and the workspace your team works in.</Text>
						</Stack>

						<Field label="Your name">
							{(id) => (
								<Input
									id={id}
									autocomplete="name"
									enterkeyhint="next"
									value={name()}
									onInput={(event) => setName(event.currentTarget.value)}
								/>
							)}
						</Field>
						<Field label="Email">
							{(id) => (
								<Input
									id={id}
									type="email"
									required
									autocomplete="email"
									inputmode="email"
									enterkeyhint="next"
									value={email()}
									onInput={(event) => setEmail(event.currentTarget.value)}
								/>
							)}
						</Field>
						<Field label="Username" hint="Lowercase letters, numbers, dots, dashes.">
							{(id) => (
								<Input
									id={id}
									required
									minlength={3}
									autocomplete="username"
									autocapitalize="off"
									enterkeyhint="next"
									value={username()}
									onInput={(event) => setUsername(event.currentTarget.value)}
								/>
							)}
						</Field>
						<Field label="Password" hint="At least 12 characters.">
							{(id) => (
								<PasswordInput
									id={id}
									required
									minlength={12}
									autocomplete="new-password"
									enterkeyhint="next"
									value={password()}
									onInput={(event) => setPassword(event.currentTarget.value)}
								/>
							)}
						</Field>
						<Field label="Workspace" hint="Your company or team.">
							{(id) => (
								<Input
									id={id}
									required
									enterkeyhint="next"
									value={workspace()}
									onInput={(event) => setWorkspace(event.currentTarget.value)}
								/>
							)}
						</Field>
						<Field
							label="Workspace URL"
							hint={`Links look like /${workspaceSlug() || "acme"}/board`}
						>
							{(id) => (
								<Input
									id={id}
									required
									minlength={2}
									autocapitalize="off"
									enterkeyhint="go"
									value={workspaceSlug()}
									onInput={(event) => setSlug(slugInput(event.currentTarget.value))}
								/>
							)}
						</Field>

						<Show when={error()}>{(message) => <Alert tone="danger" title={message()} />}</Show>

						<Button type="submit" variant="primary" size="lg" disabled={pending()} class="w-full">
							{pending() ? "Setting up…" : "Create account and workspace"}
						</Button>
					</Stack>
				</form>
			</SplitLayout>
		</Show>
	);
}
