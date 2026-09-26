import type { JSX } from "@solidjs/web";
import { createSignal, createUniqueId, Show } from "solid-js";

import { Alert, Button, Dialog, Field, Input, Stack } from "@/kit";
import { slugify, slugInput } from "@/modules/auth";

import { useWorkspaces } from "../context/workspaces-context";

/**
 * A new workspace: its name and the URL that follows it. A bottom sheet on phones, a small
 * dialog on desktop; creating one moves you into it.
 */
export function CreateWorkspaceSheet(): JSX.Element {
	const workspaces = useWorkspaces();
	const form = createUniqueId();
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
		<Dialog
			open={workspaces.createOpen()}
			onClose={close}
			title="Create a workspace"
			description="A company or team: its own projects, members and environments."
			footer={
				<>
					<Button variant="ghost" onClick={close}>
						Cancel
					</Button>
					<Button
						type="submit"
						form={form}
						variant="primary"
						disabled={pending() || !name().trim()}
					>
						{pending() ? "Creating…" : "Create workspace"}
					</Button>
				</>
			}
		>
			<form id={form} onSubmit={submit}>
				<Stack gap={4}>
					<Field label="Name">
						{(id) => (
							<Input
								id={id}
								required
								autofocus
								maxlength={120}
								enterkeyhint="next"
								placeholder="Acme"
								value={name()}
								onInput={(event) => setName(event.currentTarget.value)}
							/>
						)}
					</Field>
					<Field label="URL" hint={`Links will look like /${finalSlug() || "acme"}/board`}>
						{(id) => (
							<Input
								id={id}
								required
								minlength={2}
								autocapitalize="off"
								enterkeyhint="go"
								value={finalSlug()}
								onInput={(event) => setSlug(slugInput(event.currentTarget.value))}
							/>
						)}
					</Field>
					<Show when={error()}>{(message) => <Alert tone="danger" title={message()} />}</Show>
				</Stack>
			</form>
		</Dialog>
	);
}
