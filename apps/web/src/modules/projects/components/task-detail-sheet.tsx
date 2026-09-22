"use client";

import { Alert, AlertDescription, AlertTitle } from "@grid/ui/components/alert";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@grid/ui/components/alert-dialog";
import { Button } from "@grid/ui/components/button";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@grid/ui/components/field";
import { Input } from "@grid/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@grid/ui/components/native-select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@grid/ui/components/sheet";
import { Textarea } from "@grid/ui/components/textarea";
import { type FormEvent, type ReactNode, useState } from "react";
import { useDeleteTaskMutation, useUpdateTaskMutation } from "../hooks/use-project-mutations";
import {
	buildUpdateTaskInput,
	parsePosition,
	type TaskFormValues,
	toTaskFormValues,
} from "../lib/task-form";
import {
	TASK_STATUS_LABELS,
	TASK_STATUSES,
	type Task,
	type TaskOwnerKind,
	type TaskStatus,
} from "../types/project.types";

const OWNER_KINDS: readonly TaskOwnerKind[] = ["human", "agent"];

const OWNER_KIND_LABELS: Record<TaskOwnerKind, string> = {
	human: "Human",
	agent: "Agent",
};

type Props = {
	slug: string | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	task: Task | undefined;
	loading: boolean;
	error: unknown;
};

export function TaskDetailSheet({ slug, open, onOpenChange, task, loading, error }: Props) {
	const updateMutation = useUpdateTaskMutation(slug);
	const deleteMutation = useDeleteTaskMutation(slug);
	const [seedKey, setSeedKey] = useState<number | null>(() => task?.number ?? null);
	const [values, setValues] = useState<TaskFormValues | null>(() =>
		task ? toTaskFormValues(task) : null,
	);
	const [saved, setSaved] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState(false);

	// Reseed only when a different task arrives (or the task vanishes); a background
	// refetch of the same task must not clobber what the user is typing.
	const currentKey = task?.number ?? null;
	if (currentKey !== seedKey) {
		setSeedKey(currentKey);
		setValues(task ? toTaskFormValues(task) : null);
		setSaved(false);
	}

	const title = values?.title.trim() ?? "";
	const position = values ? parsePosition(values.position) : null;
	const canSave = Boolean(values && title && position !== null && !updateMutation.isPending);

	function update<K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) {
		setValues((previous) => (previous ? { ...previous, [key]: value } : previous));
		setSaved(false);
	}

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!task || !values || !canSave) return;
		updateMutation.mutate(
			{ number: task.number, input: buildUpdateTaskInput(values) },
			{
				onSuccess: (savedTask) => {
					setValues(toTaskFormValues(savedTask));
					setSaved(true);
				},
			},
		);
	}

	function openDeleteConfirm() {
		deleteMutation.reset();
		setConfirmDelete(true);
	}

	function handleDelete() {
		if (!task) return;
		deleteMutation.mutate(task.number, {
			onSuccess: () => {
				setConfirmDelete(false);
				onOpenChange(false);
			},
		});
	}

	let body: ReactNode;
	if (error) {
		body = (
			<div className="p-4">
				<Alert variant="destructive">
					<AlertTitle>Could not load the task</AlertTitle>
					<AlertDescription>{errorMessage(error)}</AlertDescription>
				</Alert>
			</div>
		);
	} else if (loading && !task) {
		body = <p className="p-4 text-muted-foreground text-sm">Loading task…</p>;
	} else if (!task || !values) {
		body = (
			<div className="flex flex-col items-start gap-3 p-4">
				<p className="text-muted-foreground text-sm">
					This task is no longer on the board. It may have been deleted.
				</p>
				<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
					Close
				</Button>
			</div>
		);
	} else {
		body = (
			<form className="flex min-h-full flex-col gap-5 p-4" onSubmit={handleSubmit}>
				<FieldGroup>
					<Field>
						<FieldLabel htmlFor="task-title">Title</FieldLabel>
						<Input
							id="task-title"
							value={values.title}
							onChange={(event) => update("title", event.target.value)}
							maxLength={200}
							required
							autoComplete="off"
							disabled={updateMutation.isPending}
						/>
						{!title ? <FieldError>Title is required.</FieldError> : null}
					</Field>
					<Field>
						<FieldLabel htmlFor="task-description">Description</FieldLabel>
						<Textarea
							id="task-description"
							className="min-h-28 resize-y"
							value={values.description}
							onChange={(event) => update("description", event.target.value)}
							maxLength={4000}
							placeholder="What needs to be done?"
							disabled={updateMutation.isPending}
						/>
						<FieldDescription>{values.description.length}/4000 characters</FieldDescription>
					</Field>
					<div className="grid gap-4 sm:grid-cols-2">
						<Field>
							<FieldLabel htmlFor="task-status">Status</FieldLabel>
							<NativeSelect
								id="task-status"
								value={values.status}
								disabled={updateMutation.isPending}
								onChange={(event) => update("status", event.target.value as TaskStatus)}
							>
								{TASK_STATUSES.map((status) => (
									<NativeSelectOption key={status} value={status}>
										{TASK_STATUS_LABELS[status]}
									</NativeSelectOption>
								))}
							</NativeSelect>
						</Field>
						<Field>
							<FieldLabel htmlFor="task-owner-kind">Owner kind</FieldLabel>
							<NativeSelect
								id="task-owner-kind"
								value={values.ownerKind}
								disabled={updateMutation.isPending}
								onChange={(event) => update("ownerKind", event.target.value as TaskOwnerKind)}
							>
								{OWNER_KINDS.map((kind) => (
									<NativeSelectOption key={kind} value={kind}>
										{OWNER_KIND_LABELS[kind]}
									</NativeSelectOption>
								))}
							</NativeSelect>
						</Field>
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						<Field>
							<FieldLabel htmlFor="task-owner-name">Owner name</FieldLabel>
							<Input
								id="task-owner-name"
								value={values.ownerName}
								onChange={(event) => update("ownerName", event.target.value)}
								maxLength={120}
								placeholder="Unassigned"
								autoComplete="off"
								disabled={updateMutation.isPending}
							/>
							<FieldDescription>Leave empty to unassign.</FieldDescription>
						</Field>
						<Field>
							<FieldLabel htmlFor="task-branch">Branch</FieldLabel>
							<Input
								id="task-branch"
								value={values.branch}
								onChange={(event) => update("branch", event.target.value)}
								maxLength={200}
								placeholder="agent/web/feature"
								autoComplete="off"
								className="font-mono"
								disabled={updateMutation.isPending}
							/>
						</Field>
					</div>
					<Field>
						<FieldLabel htmlFor="task-position">Position</FieldLabel>
						<Input
							id="task-position"
							type="number"
							min={0}
							max={1000000}
							step={1}
							inputMode="numeric"
							value={values.position}
							onChange={(event) => update("position", event.target.value)}
							disabled={updateMutation.isPending}
						/>
						<FieldDescription>Sort order on the board; lower numbers come first.</FieldDescription>
						{values.position.trim() !== "" && position === null ? (
							<FieldError>Enter a whole number between 0 and 1000000.</FieldError>
						) : null}
					</Field>
				</FieldGroup>

				{updateMutation.isError ? (
					<Alert variant="destructive">
						<AlertTitle>Could not save task</AlertTitle>
						<AlertDescription>{errorMessage(updateMutation.error)}</AlertDescription>
					</Alert>
				) : saved ? (
					<Alert>
						<AlertTitle>Task saved</AlertTitle>
						<AlertDescription>Your changes are now on the board.</AlertDescription>
					</Alert>
				) : null}

				<div className="mt-auto flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
					<Button
						type="button"
						variant="destructive"
						onClick={openDeleteConfirm}
						disabled={updateMutation.isPending}
					>
						Delete task
					</Button>
					<Button type="submit" disabled={!canSave}>
						{updateMutation.isPending ? "Saving…" : "Save changes"}
					</Button>
				</div>
			</form>
		);
	}

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent side="right" className="gap-0 overflow-y-auto sm:max-w-md">
				<SheetHeader className="border-b border-border pe-12">
					<SheetTitle>{task ? "Edit task" : "Task details"}</SheetTitle>
					<SheetDescription>
						{task ? `${task.key} · ${task.title}` : loading ? "Loading task…" : "Task details"}
					</SheetDescription>
				</SheetHeader>
				{body}
				<AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Delete this task?</AlertDialogTitle>
							<AlertDialogDescription>
								{task
									? `${task.key} will be removed from the board. This cannot be undone.`
									: "This task will be removed from the board. This cannot be undone."}
							</AlertDialogDescription>
						</AlertDialogHeader>
						{deleteMutation.isError ? (
							<p className="text-destructive text-sm" role="alert">
								{errorMessage(deleteMutation.error)}
							</p>
						) : null}
						<AlertDialogFooter>
							<AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
							<AlertDialogAction
								type="button"
								disabled={deleteMutation.isPending}
								onClick={handleDelete}
							>
								{deleteMutation.isPending ? "Deleting…" : "Delete task"}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</SheetContent>
		</Sheet>
	);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "Something went wrong";
}
