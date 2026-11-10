import type { JSX } from "@solidjs/web";
import { createEffect, Show } from "solid-js";

import { machinePlacement } from "@/lib/machine-scope";
import { Select } from "@/kit";
import { useAuth } from "@/modules/auth";

import { environmentsStore } from "../stores/environments";
import { machinesStore } from "../stores/machines";

/**
 * Which machine to work on: this one, one of the workspace's enrolled machines, or a paired
 * environment (a Codespace, a VPS). Shows only once there is another machine to choose, so a
 * single-machine Grid never sees it. The value is an environment id or `machine:<id>`, or null
 * for this machine.
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
			if (!token) return;
			void environmentsStore.load(token);
			void machinesStore.load(token);
		},
	);

	const team = () =>
		machinesStore.canPlace()
			? machinesStore.machines().filter((machine) => machine.status !== "disabled")
			: [];
	const paired = () => environmentsStore.environments();
	const other = () => team().length + paired().length;

	return (
		<Show when={other() > 0}>
			<Select
				label="Machine"
				disabled={props.disabled}
				value={props.value ?? ""}
				onChange={(value) => props.onChange(value || null)}
				groups={[
					{
						label: "Machine",
						options: [{ value: "", label: "This machine" }],
					},
					...(team().length > 0
						? [
								{
									label: "Team machines",
									options: team().map((machine) => ({
										value: machinePlacement(machine.id),
										label: machine.status === "online" ? machine.name : `${machine.name} (offline)`,
									})),
								},
							]
						: []),
					...(paired().length > 0
						? [
								{
									label: "Paired machines",
									options: paired().map((environment) => ({
										value: environment.id,
										label: environment.label,
									})),
								},
							]
						: []),
				]}
			/>
		</Show>
	);
}
