import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";

import {
	Alert,
	AlertIcon,
	Badge,
	Button,
	Card,
	CheckCircleIcon,
	ClockIcon,
	DescriptionList,
	Dialog,
	ListCard,
	ListRow,
	Row,
	Section,
	Skeleton,
	SpinnerIcon,
	Stack,
	Switch,
	Text,
} from "@/kit";
import type { ChatProvider } from "@/modules/chat/types/chat.types";
import { relativeTime } from "@/modules/projects/lib/relative-time";

import { describeTriggers, RUN_STATUS, RUN_TRIGGER, untilLabel } from "../lib/triggers";
import type { Automation, AutomationRun } from "../services/automations.service";

const RUN_ICONS: Record<AutomationRun["status"], () => JSX.Element> = {
	running: () => <SpinnerIcon size="sm" class="animate-spin text-accent" />,
	succeeded: () => <CheckCircleIcon size="sm" class="text-success" />,
	failed: () => <AlertIcon size="sm" class="text-danger" />,
	skipped: () => <ClockIcon size="sm" />,
};

/** The agent, model and effort that do the work, as one line: "Claude · Opus 5.5 · High". */
function agentLine(item: Automation, agents: readonly ChatProvider[]): string {
	const agent = agents.find((provider) => provider.id === item.provider);
	const model = agent?.models.find((choice) => choice.id === item.model);
	const effort = model?.efforts?.find((choice) => choice.id === item.effort);
	return [agent?.name ?? item.provider, model?.name ?? item.model, effort?.name ?? item.effort]
		.filter(Boolean)
		.join(" · ");
}

/**
 * One automation, opened: whether it is on and when it runs next, what the agent is told, how it
 * is set up, and its recent runs — each run that made a thread opens it.
 */
export function AutomationDetail(props: {
	item: Automation;
	projectName: string;
	agents: readonly ChatProvider[];
	runs: AutomationRun[] | null;
	busy: boolean;
	error: string | null;
	onClose: () => void;
	onEdit: () => void;
	onDelete: () => void;
	onRun: () => void;
	onToggle: () => void;
	onOpenRun: (run: AutomationRun) => void;
}): JSX.Element {
	const when = () => {
		if (!props.item.enabled) return "Paused: nothing runs until you switch it back on.";
		if (props.item.nextRunAt) return `Next run ${untilLabel(props.item.nextRunAt)}.`;
		return "Waiting for GitHub.";
	};
	return (
		<Dialog
			open={true}
			kind="drawer"
			width="38rem"
			title={props.item.name}
			description={props.projectName}
			onClose={props.onClose}
			footer={
				<>
					<Button variant="ghost" disabled={props.busy} onClick={props.onDelete}>
						Delete
					</Button>
					<Button disabled={props.busy} onClick={props.onEdit}>
						Edit
					</Button>
					<Button variant="primary" disabled={props.busy} onClick={props.onRun}>
						Run now
					</Button>
				</>
			}
		>
			<Stack gap={8}>
				<Show when={props.error}>{(message) => <Alert tone="danger" title={message()} />}</Show>

				<Card padding="md">
					<Row gap={3} justify="between">
						<Stack gap={1}>
							<Row gap={2}>
								<Show when={props.item.enabled} fallback={<Badge tone="neutral">Paused</Badge>}>
									<Badge tone="success" dot>
										Active
									</Badge>
								</Show>
							</Row>
							<Text tone="subtle">{when()}</Text>
						</Stack>
						<Switch
							label={props.item.enabled ? "Pause automation" : "Switch automation on"}
							checked={props.item.enabled}
							disabled={props.busy}
							onChange={props.onToggle}
						/>
					</Row>
				</Card>

				<Section title="Instructions">
					<Card padding="md">
						<Text lines>{props.item.prompt}</Text>
					</Card>
				</Section>

				<Section title="Setup">
					<Card clip>
						<DescriptionList
							items={[
								{ label: "Runs", value: describeTriggers(props.item.triggers) },
								{ label: "Agent", value: agentLine(props.item, props.agents) },
								{
									label: "Works in",
									value:
										props.item.workspaceMode === "worktree"
											? "A fresh worktree each run"
											: "The project folder",
								},
							]}
						/>
					</Card>
				</Section>

				<Section title="Recent runs">
					<Show
						when={props.runs}
						fallback={
							<Stack gap={1.5}>
								<Skeleton class="h-12" />
								<Skeleton class="h-12" />
							</Stack>
						}
					>
						{(runs) => (
							<Show
								when={runs().length > 0}
								fallback={<Text tone="subtle">No runs yet. Run it now to see how it does.</Text>}
							>
								<ListCard>
									<For each={runs()}>
										{(run) => (
											<ListRow
												icon={RUN_ICONS[run.status]()}
												title={RUN_STATUS[run.status]}
												subtitle={[RUN_TRIGGER[run.trigger], run.error].filter(Boolean).join(" · ")}
												trailing={run.startedAt ? relativeTime(run.startedAt) : undefined}
												onClick={() => props.onOpenRun(run)}
											/>
										)}
									</For>
								</ListCard>
							</Show>
						)}
					</Show>
				</Section>
			</Stack>
		</Dialog>
	);
}
