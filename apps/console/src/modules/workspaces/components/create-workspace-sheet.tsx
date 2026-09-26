import type { JSX } from "@solidjs/web";
import { createSignal, Show } from "solid-js";

import { slugify, slugInput } from "@/modules/auth";
import { Button, ErrorNotice, Field, Input, Sheet } from "@/ui";

import { useWorkspaces } from "../context/workspaces-context";

/**
 * A new workspace: its name and the URL that follows it. A bottom sheet on phones, a small
 * dialog on desktop; creating one moves you into it.
 */
export function CreateWorkspaceSheet(): JSX.Element {
	const workspaces = useWorkspaces();
	const [name, setName] = createSignal("");
	// The slug follows the name until someone edits it.
	const [slug, setSlug] = createSignal<string | null>(null);
	const finalSlug = () => slug() ?? slugify(name());
	const [error, setError] = createSignal<string | null>(null);
	const [pending, setPending] = createSignal(false);

	function close(): void {
		workspaces.setCreateOpen(false);
		setName("");
		setSlug(null);
		setError(null);
	}

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		setError(null);
		setPending(true);
		try {
			await workspaces.create({ name: name().trim(), slug: finalSlug() });
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not create the workspace");
			setPending(false);
		}
	}

	return (
		<Sheet open={workspaces.createOpen()} onClose={close} label="Create workspace">
			<form class="flex flex-col gap-4 p-4 pt-6 md:p-5" onSubmit={submit}>
				<header class="flex flex-col gap-1">
					<h2 class="font-medium text-ui-lg">Create a workspace</h2>
					<p class="text-ink/55 text-ui-sm">
						A company or team: its own projects, members and environments.
					</p>
				</header>
				<Field label="Name">
					<Input
						required
						autofocus
						maxlength={120}
						enterkeyhint="next"
						placeholder="Acme"
						value={name()}
						onInput={(event) => setName(event.currentTarget.value)}
					/>
				</Field>
				<Field label="URL" hint="Lowercase letters, numbers and dashes.">
					<Input
						required
						minlength={2}
						autocapitalize="off"
						enterkeyhint="go"
						value={finalSlug()}
						onInput={(event) => setSlug(slugInput(event.currentTarget.value))}
					/>
				</Field>
				<Show when={error()}>{(message) => <ErrorNotice message={message()} />}</Show>
				<div class="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
					<Button type="button" variant="ghost" onClick={close}>
						Cancel
					</Button>
					<Button type="submit" variant="primary" disabled={pending() || !name().trim()}>
						{pending() ? "Creating…" : "Create workspace"}
					</Button>
				</div>
			</form>
		</Sheet>
	);
}
