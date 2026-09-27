import type { JSX } from "@solidjs/web";
import { createEffect, Show } from "solid-js";

import { Select } from "@/kit";
import { useAuth } from "@/modules/auth";

import { environmentsStore } from "../stores/environments";

/**
 * Which machine to work on: this one, or a paired environment (a Codespace, a VPS). Shows only
 * once there is an environment to choose, so a single-machine Grid never sees it. The value is
 * an environment id, or null for this machine.
 */
export function MachinePicker(props: {
	value: string | null;
	onChange: (environment: string | null) => void;
	disabled?: boolean;
}): JSX.Element {
	const auth = useAuth();

	createEffect(
		() => auth.token(),
		(token) => {
			if (token) void environmentsStore.load(token);
		},
	);

	return (
		<Show when={environmentsStore.environments().length > 0}>
			<Select
				label="Machine"
				disabled={props.disabled}
				value={props.value ?? ""}
				onChange={(value) => props.onChange(value || null)}
				groups={[
					{
						label: "Machine",
						options: [
							{ value: "", label: "This machine" },
							...environmentsStore
								.environments()
								.map((environment) => ({ value: environment.id, label: environment.label })),
						],
					},
				]}
			/>
		</Show>
	);
}
