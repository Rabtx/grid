import type { JSX } from "@solidjs/web";
import { createSignal, For, onSettled } from "solid-js";

import { TASK_STATUSES, TASK_STATUS_LABELS } from "../types/project.types";

interface StageTabsProps {
	columns: Record<string, unknown[]>;
	activeStatus: string;
	setActiveStatus: (status: string) => void;
}

export function StageTabs(props: StageTabsProps): JSX.Element {
	const [, setForceUpdate] = createSignal(0);
	const lanesContainerRef = { current: null as HTMLDivElement | null };

	onSettled(() => {
		const container = lanesContainerRef.current;
		if (!container) return;

		const observer = new IntersectionObserver(
			(entries) => {
				let maxRatio = 0;
				let activeId = "";
				for (const entry of entries) {
					if (entry.intersectionRatio > maxRatio) {
						maxRatio = entry.intersectionRatio;
						activeId = entry.target.id;
					}
				}
				if (activeId && maxRatio >= 0.6) {
					const status = activeId.replace("lane-", "");
					if (status !== props.activeStatus) {
						props.setActiveStatus(status);
						setForceUpdate((n) => n + 1);
						const tab = document.getElementById(`tab-${status}`);
						tab?.scrollIntoView({ behavior: "smooth", inline: "nearest" });
					}
				}
			},
			{ root: container, threshold: [0.6] },
		);

		const lanes = container.querySelectorAll("[id^=lane-]");
		lanes.forEach((lane) => observer.observe(lane));

		return () => {
			lanes.forEach((lane) => observer.unobserve(lane));
			observer.disconnect();
		};
	});

	const scrollToLane = (status: string) => {
		const lane = document.getElementById(`lane-${status}`);
		lane?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
	};

	return (
		<div class="md:hidden" role="tablist" aria-label="Workflow stages">
			<div
				ref={(el) => {
					lanesContainerRef.current = el;
				}}
				class="flex gap-1 overflow-x-auto px-4 pb-2 min-h-row scrollbar-hide"
				aria-controls="lanes-container"
			>
				<For each={TASK_STATUSES}>
					{(status) => (
						<button
							id={`tab-${status}`}
							role="tab"
							aria-controls={`lane-${status}`}
							aria-selected={props.activeStatus === status ? "true" : "false"}
							aria-current={props.activeStatus === status ? "true" : "false"}
							class="flex min-h-row items-center gap-1.5 shrink-0 rounded-lg bg-muted px-3 py-1.5 text-ui-sm font-medium transition-colors duration-fast ease-out-grid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							onClick={() => {
								props.setActiveStatus(status);
								scrollToLane(status);
							}}
						>
							<span
								class="size-2 rounded-full"
								style={{ background: `var(--color-status-${status})` }}
								aria-hidden="true"
							/>
							<span>{TASK_STATUS_LABELS[status as keyof typeof TASK_STATUS_LABELS]}</span>
							<span class="font-mono text-ui-xs text-muted-foreground">
								{props.columns[status]?.length ?? 0}
							</span>
						</button>
					)}
				</For>
			</div>
		</div>
	);
}
