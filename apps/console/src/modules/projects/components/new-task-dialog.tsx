import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, Show } from "solid-js";

import { useAuth } from "@/modules/auth";

import { useWorkspace } from "../context/workspace-context";
import { projectsService } from "../services/projects.service";

/**
 * Adds a task to the open project's backlog. One native `<dialog>`: a bottom sheet on phones,
 * a centred dialog from `md:` up. Opened through the workspace so any "New task" button works.
 */
export function NewTaskDialog(): JSX.Element {
	const auth = useAuth();
	const workspace = useWorkspace();
	const [title, setTitle] = createSignal("");
	const [pending, setPending] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);
	let dialog: HTMLDialogElement | undefined;
	let input: HTMLInputElement | undefined;

	createEffect(
		() => workspace.newTaskOpen(),
		(open) => {
			if (!dialog) return;
			if (open && !dialog.open) {
				setError(null);
				dialog.showModal();
				input?.focus();
			} else if (!open && dialog.open) {
				dialog.close();
			}
		},
	);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		const trimmed = title().trim();
		const token = auth.token();
		const slug = workspace.activeSlug();
		if (!trimmed || !token || !slug) return;

		setError(null);
		setPending(true);
		try {
			await projectsService.createTask(token, slug, { title: trimmed });
			setTitle("");
			workspace.refreshTasks();
			workspace.setNewTaskOpen(false);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not add the task");
		} finally {
			setPending(false);
		}
	}

	return (
		// oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- backdrop light-dismiss; the modal dialog already closes on Escape
		<dialog
			ref={(el) => (dialog = el)}
			aria-labelledby="new-task-title"
			onClose={() => workspace.setNewTaskOpen(false)}
			onClick={(event) => {
				if (event.target === event.currentTarget) workspace.setNewTaskOpen(false);
			}}
			class="mx-0 mt-auto mb-0 w-full max-w-none translate-y-full rounded-t-xl border-0 bg-card p-0 text-foreground opacity-100 transition-[translate,opacity,display,overlay] transition-discrete duration-slow ease-out-grid backdrop:bg-black/40 open:translate-y-0 starting:open:translate-y-full md:m-auto md:max-w-md md:translate-y-0 md:rounded-xl md:border md:border-border md:opacity-0 md:open:opacity-100 md:starting:open:translate-y-0 md:starting:open:opacity-0"
		>
			<form
				onSubmit={submit}
				class="flex flex-col gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:p-5"
			>
				<h2 id="new-task-title" class="font-semibold text-ui-lg">
					New task
				</h2>
				<input
					ref={(el) => (input = el)}
					value={title()}
					onInput={(event) => setTitle(event.currentTarget.value)}
					placeholder="What needs doing?"
					aria-label="Task title"
					maxlength={200}
					enterkeyhint="done"
					class="h-control w-full rounded-md border border-border-strong bg-background px-3 text-ui-input outline-none focus-visible:border-ring"
				/>
				<Show when={error()}>
					{(message) => <p class="text-destructive text-ui-sm">{message()}</p>}
				</Show>
				<div class="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
					<button
						type="button"
						onClick={() => workspace.setNewTaskOpen(false)}
						class="h-control rounded-md px-3 text-ui hover:bg-accent focus-visible:bg-accent"
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={!title().trim() || pending()}
						class="h-control rounded-md bg-primary px-3 font-medium text-primary-foreground text-ui disabled:opacity-50"
					>
						{pending() ? "Adding…" : "Add to backlog"}
					</button>
				</div>
			</form>
		</dialog>
	);
}
