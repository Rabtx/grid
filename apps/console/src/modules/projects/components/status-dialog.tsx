import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, Show, untrack } from "solid-js";

import { Button, ChoiceChips, Dialog, Field, Input, notify, Text } from "@/kit";

import { useWorkspace } from "../context/workspace-context";
import { addState, CATEGORIES, isBuiltIn, renameState } from "../lib/workflow";
import type { WorkflowCategory, WorkflowState } from "../types/project.types";

import { StatusIcon } from "./status-icon";

/**
 * Add a status to the board, or rename one: its name and, for a new one, what kind it is (where
 * it sits in the work's life: how it is drawn, and what counts as done). A new status lands after
 * the last of its kind; it can be moved from its column's menu after.
 */
export function StatusDialog(props: {
	/** The status to rename; null adds a new one. */
	editing: WorkflowState | null;
	open: boolean;
	onClose: () => void;
}): JSX.Element {
	const workspace = useWorkspace();
	const [name, setName] = createSignal("");
	const [category, setCategory] = createSignal<WorkflowCategory>("started");
	const [busy, setBusy] = createSignal(false);

	createEffect(
		() => props.open,
		(open) => {
			if (!open) return;
			const editing = untrack(() => props.editing);
			setName(editing?.name ?? "");
			setCategory(editing?.category ?? "started");
		},
	);

	async function submit(): Promise<void> {
		const label = name().trim();
		if (!label || busy()) return;
		const flow = workspace.workflow();
		const editing = props.editing;
		const next = editing
			? renameState(flow, editing.key, label)
			: addState(flow, label, category());
		setBusy(true);
		try {
			await workspace.saveWorkflow(next);
			notify({ title: editing ? `Renamed to ${label}` : `Added ${label}` });
			props.onClose();
		} catch (cause) {
			notify({
				title: cause instanceof Error ? cause.message : "The board did not take that",
				tone: "danger",
			});
		} finally {
			setBusy(false);
		}
	}

	return (
		<Dialog
			open={props.open}
			onClose={props.onClose}
			title={props.editing ? "Rename status" : "Add a status"}
			description={
				props.editing
					? isBuiltIn(props.editing.key)
						? "Agents still move cards here by its key; only its name changes."
						: undefined
					: "A column of its own on the board, and a group in the list."
			}
			width="28rem"
			onSubmit={() => void submit()}
			footer={
				<>
					<Button onClick={props.onClose}>Cancel</Button>
					<Button
						variant="primary"
						disabled={busy() || !name().trim()}
						onClick={() => void submit()}
					>
						{props.editing ? "Rename" : "Add status"}
					</Button>
				</>
			}
		>
			<div class="flex flex-col gap-5">
				<Field label="Name">
					{(id) => (
						<Input
							id={id}
							value={name()}
							maxlength={40}
							placeholder="Design review"
							autofocus
							onInput={(event) => setName(event.currentTarget.value)}
						/>
					)}
				</Field>
				<Show when={!props.editing}>
					<div class="flex flex-col gap-1.5">
						<ChoiceChips<WorkflowCategory>
							label="Kind"
							options={CATEGORIES.map((item) => ({
								value: item.value,
								label: item.label,
								icon: <StatusIcon status={`new_${item.value}`} category={item.value} />,
							}))}
							value={category()}
							onChange={setCategory}
						/>
						<Text size="caption" tone="subtle">
							{CATEGORIES.find((item) => item.value === category())?.hint}
						</Text>
					</div>
				</Show>
			</div>
		</Dialog>
	);
}
