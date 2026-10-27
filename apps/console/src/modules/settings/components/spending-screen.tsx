import type { JSX } from "@solidjs/web";
import { createSignal, For, onSettled, Show } from "solid-js";

import {
	Alert,
	Badge,
	Button,
	ConfirmDialog,
	Dialog,
	EmptyState,
	Field,
	Input,
	ProgressBar,
	Select,
	SettingsGroup,
	SettingsRow,
	Skeleton,
	Stack,
	Text,
} from "@/kit";
import { useAuth } from "@/modules/auth";
import {
	type Automation,
	automationsService,
} from "@/modules/automations/services/automations.service";
import { useWorkspace } from "@/modules/projects";
import { useWorkspaces } from "@/modules/workspaces";
import { workspacesService } from "@/modules/workspaces/services/workspaces.service";
import type { Member } from "@/modules/workspaces/types/workspace.types";

import {
	type BudgetInput,
	type BudgetScope,
	type BudgetStatus,
	dollars,
	type Spending,
	spendService,
} from "../services/spend.service";
import { SettingsPage } from "./settings-page";

const SCOPES: { value: BudgetScope; label: string }[] = [
	{ value: "workspace", label: "The whole workspace" },
	{ value: "person", label: "One person" },
	{ value: "project", label: "One project" },
	{ value: "automation", label: "One automation" },
];

const STATE: Record<
	BudgetStatus["state"],
	{ tone: "success" | "warning" | "danger"; label: string }
> = {
	ok: { tone: "success", label: "Within it" },
	warning: { tone: "warning", label: "Past 80%" },
	reached: { tone: "danger", label: "Used up" },
};

/**
 * Settings → Spending: what agents cost the workspace today and this month, by project and by
 * person, and its spending limits. At 80% of a limit Grid says so; at 100% it stops the turns
 * the limit covers and starts no more until the day or month resets (UTC) or an admin raises it.
 */
export function SpendingScreen(): JSX.Element {
	const auth = useAuth();
	const workspace = useWorkspace();
	const workspaces = useWorkspaces();
	const [spending, setSpending] = createSignal<Spending | null>(null);
	const [members, setMembers] = createSignal<Member[]>([]);
	const [automations, setAutomations] = createSignal<Automation[]>([]);
	const [error, setError] = createSignal<string | null>(null);
	const [making, setMaking] = createSignal<BudgetInput | null>(null);
	const [removing, setRemoving] = createSignal<BudgetStatus | null>(null);
	const [busy, setBusy] = createSignal(false);

	async function load(): Promise<void> {
		const token = auth.token();
		if (!token) return;
		try {
			setSpending(await spendService.get(token));
			setError(null);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not read spending");
		}
	}

	onSettled(() => {
		void load();
		const token = auth.token();
		const slug = workspaces.current()?.slug;
		if (!token) return;
		if (slug)
			void workspacesService.members(token, slug).then(setMembers, (cause: unknown) => {
				console.warn("[spending] could not read the members:", cause);
			});
		void automationsService.list(token).then(setAutomations, (cause: unknown) => {
			console.warn("[spending] could not read the automations:", cause);
		});
	});

	const personName = (id: string) => {
		const member = members().find((item) => item.userId === id);
		return member?.displayName || member?.username || id;
	};
	const projectName = (slug: string) =>
		workspace.projects().find((project) => project.slug === slug)?.name ?? slug;
	const automationName = (id: string) => automations().find((item) => item.id === id)?.name ?? id;
	const budgetLabel = (budget: Pick<BudgetStatus, "scope" | "target" | "period">) => {
		const period = budget.period === "day" ? "Daily" : "Monthly";
		const target = budget.target ?? "";
		const whose =
			budget.scope === "workspace"
				? "the workspace"
				: budget.scope === "person"
					? personName(target)
					: budget.scope === "project"
						? projectName(target)
						: automationName(target);
		return `${period} budget for ${whose}`;
	};

	const targets = (scope: BudgetScope): { value: string; label: string }[] =>
		scope === "person"
			? members().map((member) => ({
					value: member.userId,
					label: member.displayName || member.username,
				}))
			: scope === "project"
				? workspace.projects().map((project) => ({ value: project.slug, label: project.name }))
				: scope === "automation"
					? automations().map((item) => ({ value: item.id, label: item.name }))
					: [];

	async function create(): Promise<void> {
		const token = auth.token();
		const input = making();
		if (!token || !input) return;
		setBusy(true);
		try {
			await spendService.createBudget(token, input);
			setMaking(null);
			await load();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not save the budget");
		} finally {
			setBusy(false);
		}
	}

	async function remove(): Promise<void> {
		const token = auth.token();
		const budget = removing();
		if (!token || !budget) return;
		setBusy(true);
		try {
			await spendService.removeBudget(token, budget.id);
			setRemoving(null);
			await load();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not remove the budget");
		} finally {
			setBusy(false);
		}
	}

	const change = (next: Partial<BudgetInput>) =>
		setMaking((current) => (current ? { ...current, ...next } : current));

	return (
		<SettingsPage
			title="Spending"
			description="What agents cost this workspace, and limits on it. Past 80% of a limit Grid says so; at 100% it stops the work the limit covers until it resets."
			actions={
				<Show when={spending()?.canManage}>
					<Button
						size="sm"
						onClick={() =>
							setMaking({ scope: "workspace", target: null, period: "month", limitUsd: 100 })
						}
					>
						New budget
					</Button>
				</Show>
			}
		>
			<Show when={error()}>{(message) => <Alert tone="danger" title={message()} />}</Show>
			<Show
				when={spending()}
				fallback={
					<Stack gap={2}>
						<Skeleton class="h-14" />
						<Skeleton class="h-14" />
					</Stack>
				}
			>
				{(shown) => (
					<>
						<SettingsGroup title="Spent">
							<SettingsRow label="Today" description="Since midnight UTC">
								<Text tabular>{dollars(shown().today)}</Text>
							</SettingsRow>
							<SettingsRow label="This month" description="Since the 1st, UTC">
								<Text tabular>{dollars(shown().month)}</Text>
							</SettingsRow>
						</SettingsGroup>

						<SettingsGroup title="Budgets">
							<Show
								when={shown().budgets.length > 0}
								fallback={
									<EmptyState
										title="No budgets"
										description={
											shown().canManage
												? "Set one for the workspace, a person, a project or an automation."
												: "Owners and admins set them."
										}
									/>
								}
							>
								<For each={shown().budgets}>
									{(budget) => (
										<SettingsRow
											label={budgetLabel(budget)}
											description={
												<div class="flex min-w-0 flex-col gap-1.5 pt-1">
													<span>
														{dollars(budget.spentUsd)} of {dollars(budget.limitUsd)} this{" "}
														{budget.period}
													</span>
													<ProgressBar
														value={budget.limitUsd > 0 ? budget.spentUsd / budget.limitUsd : 1}
														tone={STATE[budget.state].tone}
														label={budgetLabel(budget)}
													/>
												</div>
											}
										>
											<Badge tone={STATE[budget.state].tone}>{STATE[budget.state].label}</Badge>
											<Show when={shown().canManage}>
												<Button size="sm" variant="ghost" onClick={() => setRemoving(budget)}>
													Remove
												</Button>
											</Show>
										</SettingsRow>
									)}
								</For>
							</Show>
						</SettingsGroup>

						<Show when={shown().byProject.length > 0}>
							<SettingsGroup title="This month by project">
								<For each={shown().byProject}>
									{(row) => (
										<SettingsRow inline label={projectName(row.key)}>
											<Text tabular>{dollars(row.usd)}</Text>
										</SettingsRow>
									)}
								</For>
							</SettingsGroup>
						</Show>
						<Show when={shown().byPerson.length > 0}>
							<SettingsGroup title="This month by person">
								<For each={shown().byPerson}>
									{(row) => (
										<SettingsRow inline label={personName(row.key)}>
											<Text tabular>{dollars(row.usd)}</Text>
										</SettingsRow>
									)}
								</For>
							</SettingsGroup>
						</Show>
						<Text size="caption" tone="faint">
							Costs are what agents report as they work (Claude Code reports its own; agents that
							report none count as nothing).
						</Text>
					</>
				)}
			</Show>

			<Dialog
				open={making() !== null}
				onClose={() => setMaking(null)}
				title="New budget"
				width="30rem"
				onSubmit={() => void create()}
				footer={
					<>
						<Button variant="ghost" onClick={() => setMaking(null)}>
							Cancel
						</Button>
						<Button
							disabled={
								busy() ||
								!making() ||
								(making()?.scope !== "workspace" && !making()?.target) ||
								!((making()?.limitUsd ?? 0) > 0)
							}
							onClick={() => void create()}
						>
							Save budget
						</Button>
					</>
				}
			>
				<Show when={making()}>
					{(form) => (
						<Stack gap={3}>
							<Field label="For">
								{() => (
									<Select<BudgetScope>
										label="For"
										look="field"
										value={form().scope}
										onChange={(scope) => change({ scope, target: null })}
										groups={[{ options: SCOPES }]}
									/>
								)}
							</Field>
							<Show when={form().scope !== "workspace"}>
								<Field label="Which">
									{() => (
										<Select
											label="Which"
											look="field"
											value={form().target ?? ""}
											onChange={(target) => change({ target: target || null })}
											groups={[
												{
													options: [{ value: "", label: "Choose…" }, ...targets(form().scope)],
												},
											]}
										/>
									)}
								</Field>
							</Show>
							<Field label="Every">
								{() => (
									<Select
										label="Every"
										look="field"
										value={form().period}
										onChange={(period) => change({ period: period as BudgetInput["period"] })}
										groups={[
											{
												options: [
													{ value: "day", label: "Day (UTC)" },
													{ value: "month", label: "Month (UTC)" },
												],
											},
										]}
									/>
								)}
							</Field>
							<Field label="Limit (USD)">
								{(id) => (
									<Input
										id={id}
										type="number"
										min="0.01"
										step="0.01"
										inputmode="decimal"
										value={String(form().limitUsd)}
										onInput={(event) => change({ limitUsd: Number(event.currentTarget.value) })}
									/>
								)}
							</Field>
						</Stack>
					)}
				</Show>
			</Dialog>

			<ConfirmDialog
				open={removing() !== null}
				onClose={() => setRemoving(null)}
				onConfirm={() => void remove()}
				title="Remove this budget?"
				description="Work it stopped can start again at once."
				confirm="Remove"
				danger
				stayOpen
				pending={busy()}
			/>
		</SettingsPage>
	);
}
