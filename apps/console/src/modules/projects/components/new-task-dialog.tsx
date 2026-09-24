import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, Show } from "solid-js";

import { useAuth } from "@/modules/auth";
import { Button, ErrorNotice, Input, Sheet, toast } from "@/ui";

import { useWorkspace } from "../context/workspace-context";
import { projectsService } from "../services/projects.service";

/**
 * Adds a task to the open project's backlog: a bottom sheet on phones, a top-anchored dialog
 * from `md:` up. Opened through the workspace so any "New task" control works.
 */
export function NewTaskDialog(): JSX.Element {
	const auth = useAuth();
	const workspace = useWorkspace();
	const [title, setTitle] = createSignal("");
	const [pending, setPending] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);
	let input: HTMLInputElement | undefined;

	createEffect(
		() => workspace.newTaskOpen(),
		(open) => {
			if (!open) return;
			setError(null);
			input?.focus();
		},
	);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		const addAnother =
			(event as SubmitEvent & { ctrlKey: boolean; metaKey: boolean }).ctrlKey ||
			(event as SubmitEvent & { ctrlKey: boolean; metaKey: boolean }).metaKey;
		const trimmed = title().trim();
		const token = auth.token();
		const slug = workspace.activeSlug();
		if (!trimmed || !token || !slug) return;

		setError(null);
		setPending(true);
		try {
			const task = await projectsService.createTask(token, slug, { title: trimmed });
			setTitle("");
			workspace.refreshTasks();
			toast({
				message: `Added ${task.key}`,
				action: { label: "Open", onClick: () => workspace.openTask(task.number) },
			});
			if (addAnother) input?.focus();
			else workspace.setNewTaskOpen(false);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not add the task");
		} finally {
			setPending(false);
		}
	}

	return (
		<Sheet
			open={workspace.newTaskOpen()}
			onClose={() => workspace.setNewTaskOpen(false)}
			label="New task"
		>
			<form onSubmit={submit} class="flex flex-col gap-3 p-4">
				<h2 class="font-semibold text-ui">New task</h2>
				<Input
					ref={(el) => {
						input = el;
					}}
					value={title()}
					onInput={(event) => setTitle(event.currentTarget.value)}
					placeholder="What needs doing?"
					aria-label="Task title"
					maxlength={200}
					enterkeyhint="done"
				/>
				<Show when={error()}>{(message) => <ErrorNotice message={message()} />}</Show>
				<div class="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
					<Button variant="ghost" onClick={() => workspace.setNewTaskOpen(false)}>
						Cancel
					</Button>
					<Button type="submit" variant="primary" disabled={!title().trim() || pending()}>
						{pending() ? "Adding…" : "Add to backlog"}
					</Button>
				</div>
			</form>
		</Sheet>
	);
}
