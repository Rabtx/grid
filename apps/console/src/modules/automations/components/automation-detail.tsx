import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";

import {
	AgentLogo,
	Alert,
	AutomationActionBar,
	AutomationCard,
	AutomationHeading,
	AutomationLayout,
	BackIcon,
	BoltIcon,
	BranchIcon,
	Button,
	button,
	ClockIcon,
	EditIcon,
	EyeIcon,
	FolderIcon,
	GuardrailCard,
	Guardrails,
	IconButton,
	iconButton,
	LaptopIcon,
	LastRunCard,
	Menu,
	MoreIcon,
	NeedsReviewBadge,
	PullRequestIcon,
	Recipe,
	RecipePrompt,
	RecipeToken,
	RoleMark,
	RunDots,
	RunStepRow,
	RunsTable,
	RunTableRow,
	ShieldIcon,
	Skeleton,
	Stack,
	Switch,
	Text,
} from "@/kit";
import { agentName } from "@/modules/chat/stores/providers";
import type { ChatProvider, Role } from "@/modules/chat/types/chat.types";
import { relativeTime } from "@/modules/projects/lib/relative-time";
import { ShellSlot } from "@/modules/shell";

import {
	nextLine,
	runDuration,
	runMark,
	runResult,
	runWhen,
	STRIP_RUNS,
	stepKind,
	stripMarks,
	stripNote,
	triggerLine,
	triggerRecipe,
} from "../lib/automation-look";
import type { Automation, AutomationRun } from "../services/automations.service";

/**
 * One automation, opened (Figma 20 · Automations): when it runs next and who made it, its recipe
 * read as a sentence, its guardrails and runs, and beside them its last run step by step with the
 * strip of its recent runs. On phones the last run comes first and Active and Run now sit in a bar
 * at the bottom.
 */
export function AutomationDetail(props: {
	item: Automation;
	projectName: string;
	agents: readonly ChatProvider[];
	roles: readonly Role[];
	runs: AutomationRun[] | null;
	ownerName: string | null;
	busy: boolean;
	error: string | null;
	reviewHref: (pull: number) => string;
	onBack: () => void;
	onEdit: () => void;
	onDelete: () => void;
	onRun: () => void;
	onToggle: () => void;
	onOpenRun: (run: AutomationRun) => void;
}): JSX.Element {
	const options = () => props.item.options;
	const role = () => props.roles.find((item) => item.id === options().role) ?? null;
	const agent = () => props.agents.find((item) => item.id === props.item.provider);
	const model = () =>
		agent()?.models.find((choice) => choice.id === props.item.model)?.name ?? props.item.model;
	const who = () =>
		[role()?.name ?? agentName(props.item.provider), model()].filter(Boolean).join(" · ");
	const last = () => props.runs?.[0] ?? props.item.lastRun ?? null;
	const waiting = () => {
		const run = last();
		return Boolean(run?.pullNumber && run.status === "succeeded" && options().waitForReview);
	};

	const menu = (phone: boolean) => (
		<Menu
			label={`Actions for ${props.item.name}`}
			title={phone ? props.item.name : undefined}
			trigger={<MoreIcon />}
			triggerClass={
				phone
					? iconButton({ size: "lg", shape: "round", variant: "secondary" })
					: iconButton({ size: "sm" })
			}
			placement="bottom-end"
			groups={[
				{ items: [{ id: "edit", label: "Edit" }] },
				{ items: [{ id: "delete", label: "Delete", danger: true }] },
			]}
			onSelect={(id) => (id === "edit" ? props.onEdit() : props.onDelete())}
		/>
	);

	const lastRun = () => (
		<LastRunCard
			title="Last run"
			meta={
				last()
					? [runWhen(last()?.startedAt ?? null), runDuration(last() as AutomationRun)]
							.filter((part) => part !== "—")
							.join(" · ")
					: "Not run yet"
			}
			badge={
				<Show when={waiting()}>
					<NeedsReviewBadge>Needs review</NeedsReviewBadge>
				</Show>
			}
			footer={
				<RunDots
					label={`Last ${STRIP_RUNS} runs`}
					note={stripNote(props.item.recent)}
					marks={stripMarks(props.item.recent)}
				/>
			}
		>
			<Show
				when={last()}
				fallback={
					<li>
						<Text size="caption" tone="subtle">
							Run it now to see what it does, step by step.
						</Text>
					</li>
				}
			>
				{(run) => (
					<>
						<For each={run().steps}>
							{(step) => (
								<RunStepRow
									kind={stepKind(step.title, step.detail)}
									title={step.title}
									detail={step.detail ?? undefined}
								/>
							)}
						</For>
						<Show when={!run().steps.length && run().summary}>
							<RunStepRow kind="terminal" title={run().summary as string} />
						</Show>
						<Show when={run().status === "running"}>
							<RunStepRow kind="terminal" title="Running…" />
						</Show>
						<Show when={run().error}>
							<RunStepRow kind="failed" title={run().error as string} />
						</Show>
						<Show when={run().pullNumber}>
							{(pull) => (
								<RunStepRow
									kind="pull"
									title={`Opened PR #${pull()}`}
									detail={waiting() ? "Waiting for your review" : undefined}
									action={
										<a
											href={props.reviewHref(pull())}
											class={button({ size: "sm", variant: "primary" })}
										>
											Review
										</a>
									}
								/>
							)}
						</Show>
					</>
				)}
			</Show>
		</LastRunCard>
	);

	return (
		<>
			<ShellSlot name="crumb">{props.item.name}</ShellSlot>
			<ShellSlot name="actions">
				<Text size="body" tone="subtle">
					Active
				</Text>
				<Switch
					label={props.item.enabled ? "Pause automation" : "Switch automation on"}
					checked={props.item.enabled}
					disabled={props.busy}
					onChange={props.onToggle}
				/>
				<Button size="sm" variant="primary" disabled={props.busy} onClick={props.onRun}>
					<BoltIcon size="sm" /> Run now
				</Button>
				{menu(false)}
			</ShellSlot>
			<ShellSlot name="heading">
				<div class="flex min-w-0 flex-col items-center">
					<Text as="h1" tone="strong" weight="medium" size="body-lg" truncate>
						Automations
					</Text>
					<Text size="caption" tone="subtle" truncate>
						{nextLine(props.item)}
					</Text>
				</div>
			</ShellSlot>
			<ShellSlot name="leading">
				<IconButton
					label="All automations"
					variant="secondary"
					shape="round"
					size="lg"
					onClick={props.onBack}
				>
					<BackIcon />
				</IconButton>
			</ShellSlot>
			<ShellSlot name="trailing">{menu(true)}</ShellSlot>

			<AutomationLayout
				heading={
					<AutomationHeading
						glyph={options().icon}
						paused={!props.item.enabled}
						title={props.item.name}
						phoneMeta={
							<>
								<AgentLogo id={props.item.provider} name={agentName(props.item.provider)} />
								<span class="truncate">
									{role()?.name ?? agentName(props.item.provider)} · runs{" "}
									{triggerLine(props.item.triggers[0]).replace(/^\w/, (first) =>
										first.toLowerCase(),
									)}
								</span>
							</>
						}
						meta={
							<>
								<span>{nextLine(props.item)}</span>
								<Show when={props.ownerName}>
									<span aria-hidden="true">·</span>
									<span>Created by {props.ownerName}</span>
								</Show>
							</>
						}
					/>
				}
				aside={lastRun()}
				main={
					<>
						<Show when={props.error}>{(message) => <Alert tone="danger" title={message()} />}</Show>
						<AutomationCard label="Recipe" note={`Edited ${relativeTime(props.item.updatedAt)}`}>
							<Recipe>
								<For each={props.item.triggers}>
									{(trigger, index) => (
										<>
											<span>{index() === 0 ? triggerRecipe(trigger).lead : "or"}</span>
											<RecipeToken icon={<ClockIcon />} tone="accent">
												{index() === 0
													? triggerRecipe(trigger).token
													: `${triggerRecipe(trigger).lead.toLowerCase()} ${triggerRecipe(trigger).token}`}
											</RecipeToken>
										</>
									)}
								</For>
								<Show when={props.item.machine}>
									<span>on</span>
									<RecipeToken icon={<LaptopIcon />}>{props.item.machine}</RecipeToken>
								</Show>
								<span>in</span>
								<RecipeToken icon={<FolderIcon />} tone="accent">
									{props.projectName}
								</RecipeToken>
								<Show when={props.item.workspaceMode === "worktree"}>
									<RecipeToken icon={<BranchIcon />}>
										{options().branch ?? "a fresh worktree"}
									</RecipeToken>
								</Show>
								<span>ask</span>
								<RecipeToken
									icon={
										<Show
											when={role()}
											fallback={
												<AgentLogo id={props.item.provider} name={agentName(props.item.provider)} />
											}
										>
											{(chosen) => <RoleMark icon={chosen().icon} size="sm" />}
										</Show>
									}
								>
									{who()}
								</RecipeToken>
								<span>to</span>
							</Recipe>
							<RecipePrompt
								text={props.item.prompt}
								meta={`${props.item.prompt.length} characters`}
							/>
							<Show when={options().pullRequest}>
								<Recipe>
									<span>then</span>
									<RecipeToken icon={<PullRequestIcon />} tone="violet">
										open a pull request
									</RecipeToken>
									<Show when={options().waitForReview}>
										<span>and</span>
										<RecipeToken icon={<EyeIcon />}>wait for my review</RecipeToken>
									</Show>
								</Recipe>
							</Show>
						</AutomationCard>

						<Guardrails>
							<GuardrailCard
								icon={<ClockIcon />}
								label="Time limit"
								value={options().minutes ? `${options().minutes} min` : "No limit"}
								unset={!options().minutes}
							/>
							<GuardrailCard
								icon={<BoltIcon />}
								label="Budget"
								value={options().budgetUsd ? `$${options().budgetUsd} per run` : "No budget"}
								unset={!options().budgetUsd}
							/>
							<GuardrailCard
								icon={<ShieldIcon />}
								label="Off-limits"
								value={options().offLimits.length ? options().offLimits.join(", ") : "Nothing"}
								unset={!options().offLimits.length}
							/>
						</Guardrails>

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
									when={runs().length}
									fallback={
										<Text tone="subtle" size="caption">
											No runs yet. Run it now to see how it does.
										</Text>
									}
								>
									<RunsTable>
										<For each={runs()}>
											{(run) => (
												<RunTableRow
													mark={runMark(run)}
													when={runWhen(run.startedAt ?? run.scheduledFor)}
													result={runResult(run)}
													failed={run.status === "failed"}
													duration={runDuration(run)}
													onOpen={run.sessionId ? () => props.onOpenRun(run) : undefined}
												/>
											)}
										</For>
									</RunsTable>
								</Show>
							)}
						</Show>
					</>
				}
			/>

			<AutomationActionBar>
				<Switch
					label={props.item.enabled ? "Pause automation" : "Switch automation on"}
					checked={props.item.enabled}
					disabled={props.busy}
					onChange={props.onToggle}
				/>
				<Text size="body" tone="strong">
					Active
				</Text>
				<span class="flex-1" />
				<IconButton
					label="Edit automation"
					variant="secondary"
					shape="round"
					size="lg"
					onClick={props.onEdit}
				>
					<EditIcon />
				</IconButton>
				<Button size="lg" variant="primary" disabled={props.busy} onClick={props.onRun}>
					<BoltIcon size="sm" /> Run now
				</Button>
			</AutomationActionBar>
		</>
	);
}
