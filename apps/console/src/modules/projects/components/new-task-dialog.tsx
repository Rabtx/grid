import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, Show } from "solid-js";

import { useAuth } from "@/modules/auth";
import { Button, ErrorNotice, Input, SegmentedControl, Sheet, toast } from "@/ui";

import { useWorkspace } from "../context/workspace-context";
import { projectsService } from "../services/projects.service";
import {
	TASK_STATUS_LABELS,
	TASK_STATUSES,
	type TaskOwnerKind,
	type TaskStatus,
} from "../types/project.types";

import { MarkdownField } from "./markdown-field";
import { StatusIcon } from "./status-icon";

type Owner = "none" | TaskOwnerKind;

/**
 * File an issue in the open project: a title, an optional Markdown description, the stage it
 * starts in and who owns it. Enter in the title (or Cmd/Ctrl+Enter anywhere) adds it; with
 * "Add another" on, the sheet stays open for the next one. A bottom sheet on phones, a
 * top-anchored dialog from `md:`.
 */
export function NewTaskDialog(): JSX.Element {
	const auth = useAuth();
	const workspace = useWorkspace();
	const [title, setTitle] = createSignal("");
	const [description, setDescription] = createSignal("");
	const [status, setStatus] = createSignal<TaskStatus>("backlog");
	const [owner, setOwner] = createSignal<Owner>("none");
	const [ownerName, setOwnerName] = createSignal("");
	const [another, setAnother] = createSignal(false);
	const [pending, setPending] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);
	let input: HTMLInputElement | undefined;

	// Each opening starts clean, in the lane (or with the owner) it was opened from.
	createEffect(
		() => (workspace.newTaskOpen() ? workspace.newTaskDefaults() : null),
		(defaults) => {
			if (!defaults) return;
			setError(null);
			setStatus(defaults.status ?? "backlog");
			setOwner(defaults.ownerKind ?? "none");
			setOwnerName(defaults.ownerName ?? "");
			queueMicrotask(() => input?.focus());
		},
	);

	function reset(): void {
		setTitle("");
		setDescription("");
	}

	async function submit(): Promise<void> {
		const trimmed = title().trim();
		const token = auth.token();
		const slug = workspace.activeSlug() ?? workspace.currentSlug();
		if (!trimmed || !token || !slug || pending()) return;

		setError(null);
		setPending(true);
		try {
			const task = await projectsService.createTask(token, slug, {
				title: trimmed,
				description: description().trim() ? description() : null,
				status: status(),
				ownerKind: owner() === "none" ? null : (owner() as TaskOwnerKind),
				ownerName: owner() === "none" ? null : ownerName().trim() || null,
			});
			reset();
			workspace.refreshTasks();
			toast({
				message: `Added ${task.key} to ${TASK_STATUS_LABELS[task.status]}`,
				action: { label: "Open", onClick: () => workspace.openTask(task.number) },
			});
			if (another()) input?.focus();
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
			<form
				class="flex max-h-[85dvh] flex-col gap-4 overflow-y-auto p-4 md:max-h-[70dvh]"
				onSubmit={(event) => {
					event.preventDefault();
					void submit();
				}}
			>
				<h2 class="font-semibold text-ui">
					New task{workspace.activeProject() ? ` in ${workspace.activeProject()?.name}` : ""}
				</h2>
				<Input
					ref={(el) => {
						input = el;
					}}
					value={title()}
					onInput={(event) => setTitle(event.currentTarget.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
							event.preventDefault();
							void submit();
						}
					}}
					placeholder="What needs doing?"
					aria-label="Task title"
					maxlength={200}
					enterkeyhint="done"
				/>
				<MarkdownField
					label="Description"
					value={description()}
					onInput={setDescription}
					onSubmit={() => void submit()}
					rows={4}
				/>
				<fieldset class="flex flex-col gap-2 border-0 p-0">
					<legend class="mb-2 font-medium text-ink/70 text-ui-sm">Status</legend>
					<div class="flex flex-wrap gap-1.5">
						<For each={TASK_STATUSES}>
							{(value) => (
								<button
									type="button"
									aria-pressed={status() === value ? "true" : "false"}
									onClick={() => setStatus(value)}
									class="focus-ring inline-flex h-7 items-center gap-1.5 rounded-md border border-ink/10 px-2 text-ink/60 text-ui-sm hover:text-ink aria-pressed:border-ink/25 aria-pressed:bg-selection aria-pressed:text-ink pointer-coarse:h-10"
								>
									<StatusIcon status={value} />
									{TASK_STATUS_LABELS[value]}
								</button>
							)}
						</For>
					</div>
				</fieldset>
				<div class="flex flex-col gap-2">
					<span class="font-medium text-ink/70 text-ui-sm">Owner</span>
					<div class="flex flex-wrap items-center gap-2">
						<SegmentedControl
							label="Owner"
							options={[
								{ value: "none", label: "Nobody" },
								{ value: "human", label: "Person" },
								{ value: "agent", label: "Agent" },
							]}
							value={owner()}
							onChange={setOwner}
						/>
						<Show when={owner() !== "none"}>
							<Input
								value={ownerName()}
								onInput={(event) => setOwnerName(event.currentTarget.value)}
								placeholder={owner() === "agent" ? "Agent name" : "Person's name"}
								aria-label="Owner name"
								class="min-w-0 flex-1"
							/>
						</Show>
					</div>
				</div>
				<Show when={error()}>{(message) => <ErrorNotice message={message()} />}</Show>
				<div class="flex flex-col-reverse gap-2 md:flex-row md:items-center">
					<label class="flex min-h-10 items-center gap-2 text-ink/60 text-ui-sm md:mr-auto">
						<input
							type="checkbox"
							checked={another()}
							onChange={(event) => setAnother(event.currentTarget.checked)}
							class="size-4 accent-[var(--color-accent)]"
						/>
						Add another
					</label>
					<Button variant="ghost" onClick={() => workspace.setNewTaskOpen(false)}>
						Cancel
					</Button>
					<Button type="submit" variant="primary" disabled={!title().trim() || pending()}>
						{pending() ? "Adding…" : "Add task"}
					</Button>
				</div>
			</form>
		</Sheet>
	);
}
