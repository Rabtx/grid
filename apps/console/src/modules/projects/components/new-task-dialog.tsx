import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, Show } from "solid-js";

import {
	Alert,
	Button,
	CheckboxField,
	ChoiceChips,
	Dialog,
	Input,
	notify,
	Row,
	Segmented,
	Stack,
	Text,
	TitleInput,
} from "@/kit";
import { useAuth } from "@/modules/auth";

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

const FORM_ID = "new-task-form";

/**
 * File an issue in the open project: a title, an optional Markdown description, the stage it
 * starts in and who owns it. Enter in the title (or Cmd/Ctrl+Enter anywhere) adds it; with
 * "Add another" on, the dialog stays open for the next one. A bottom sheet on phones, a dialog
 * from `md:`.
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
			notify({
				title: `Added ${task.key} to ${TASK_STATUS_LABELS[task.status]}`,
				action: { label: "Open", run: () => workspace.openTask(task.number) },
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
		<Dialog
			open={workspace.newTaskOpen()}
			onClose={() => workspace.setNewTaskOpen(false)}
			title={`New task${workspace.activeProject() ? ` in ${workspace.activeProject()?.name}` : ""}`}
			width="36rem"
			footer={
				<>
					<CheckboxField
						label="Add another"
						checked={another()}
						onChange={setAnother}
						class="md:mr-auto"
					/>
					<Button variant="ghost" onClick={() => workspace.setNewTaskOpen(false)}>
						Cancel
					</Button>
					<Button
						type="submit"
						form={FORM_ID}
						variant="primary"
						disabled={!title().trim() || pending()}
					>
						{pending() ? "Adding…" : "Add task"}
					</Button>
				</>
			}
		>
			<form
				id={FORM_ID}
				onSubmit={(event) => {
					event.preventDefault();
					void submit();
				}}
			>
				<Stack gap={5}>
					<TitleInput
						ref={(el: HTMLInputElement) => {
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
					<ChoiceChips<TaskStatus>
						label="Status"
						options={TASK_STATUSES.map((value) => ({
							value,
							label: TASK_STATUS_LABELS[value],
							icon: <StatusIcon status={value} />,
						}))}
						value={status()}
						onChange={setStatus}
					/>
					<Stack gap={2}>
						<Text as="span" tone="strong" weight="medium">
							Owner
						</Text>
						<Row gap={2} wrap>
							<Segmented<Owner>
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
						</Row>
					</Stack>
					<Show when={error()}>{(message) => <Alert tone="danger" title={message()} />}</Show>
				</Stack>
			</form>
		</Dialog>
	);
}
