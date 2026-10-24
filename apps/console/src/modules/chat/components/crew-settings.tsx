import type { JSX } from "@solidjs/web";
import { createEffect, createSignal } from "solid-js";

import { Button, Dialog, Field, Input, Stack, Textarea } from "@/kit";

import type { Crew } from "../types/chat.types";

type Patch = Partial<Pick<Crew, "name" | "instructions" | "parallel">>;

/** A crew's settings: its name, what every member is told, and how many work at once. */
export function CrewSettingsDialog(props: {
	open: boolean;
	crew: Crew;
	onClose: () => void;
	onSave: (patch: Patch) => Promise<void>;
}): JSX.Element {
	const [name, setName] = createSignal("");
	const [instructions, setInstructions] = createSignal("");
	const [parallel, setParallel] = createSignal(3);
	const [saving, setSaving] = createSignal(false);
	// Opened again, it shows the crew as it is now.
	createEffect(
		() => props.open,
		(open) => {
			if (!open) return;
			setName(props.crew.name);
			setInstructions(props.crew.instructions);
			setParallel(props.crew.parallel);
		},
	);
	const save = async () => {
		setSaving(true);
		try {
			await props.onSave({ name: name(), instructions: instructions(), parallel: parallel() });
		} finally {
			setSaving(false);
		}
	};
	return (
		<Dialog
			open={props.open}
			onClose={props.onClose}
			title="Crew settings"
			description="Members started from now on are told the new instructions."
			width="32rem"
			onSubmit={() => void save()}
			footer={
				<>
					<Button onClick={props.onClose}>Cancel</Button>
					<Button
						variant="primary"
						disabled={saving() || !name().trim()}
						onClick={() => void save()}
					>
						Save
					</Button>
				</>
			}
		>
			<Stack gap={3} class="px-5 pb-2">
				<Field label="Name">
					{(id) => (
						<Input id={id} value={name()} onInput={(event) => setName(event.currentTarget.value)} />
					)}
				</Field>
				<Field label="Shared instructions" hint="Every member is told these with its task.">
					{(id) => (
						<Textarea
							id={id}
							rows={5}
							value={instructions()}
							onInput={(event) => setInstructions(event.currentTarget.value)}
						/>
					)}
				</Field>
				<Field label="Members working at once" hint="1 to 8; the rest wait their turn.">
					{(id) => (
						<Input
							id={id}
							type="number"
							min={1}
							max={8}
							value={parallel()}
							onInput={(event) => {
								const value = Number(event.currentTarget.value);
								if (Number.isFinite(value))
									setParallel(Math.min(8, Math.max(1, Math.round(value))));
							}}
						/>
					)}
				</Field>
			</Stack>
		</Dialog>
	);
}
