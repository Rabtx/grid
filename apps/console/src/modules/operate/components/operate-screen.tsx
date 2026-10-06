import type { JSX } from "@solidjs/web";
import { createSignal, Show } from "solid-js";
import { Tabs } from "@/kit";
import { OperateHealth } from "./operate-health";
import { OperateLogs } from "./operate-logs";
import { OperateCosts } from "./operate-costs";

type View = "health" | "logs" | "costs";
export function OperateScreen(): JSX.Element {
	const [view, setView] = createSignal<View>("health");
	const tabs = () => (
		<Tabs
			label="Operate views"
			value={view()}
			onChange={setView}
			options={[
				{ value: "health", label: "Health" },
				{ value: "logs", label: "Logs" },
				{ value: "costs", label: "Costs" },
			]}
		/>
	);
	return (
		<>
			<Show when={view() === "health"}>
				<OperateHealth tabs={tabs()} />
			</Show>
			<Show when={view() === "logs"}>
				<OperateLogs tabs={tabs()} />
			</Show>
			<Show when={view() === "costs"}>
				<OperateCosts tabs={tabs()} />
			</Show>
		</>
	);
}
