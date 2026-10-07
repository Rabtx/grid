import { useMatch, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, createSignal, For, Show, untrack } from "solid-js";

import {
	AgentLogo,
	Alert,
	Badge,
	Button,
	ButtonLink,
	CardRow,
	EmptyState,
	LaptopIcon,
	MetricCard,
	MetricGrid,
	MachineMetrics,
	NavLink,
	NavSection,
	Page,
	PageHeader,
	ProgressBar,
	Section,
	SectionCard,
	Skeleton,
	Stack,
	TerminalIcon,
	Text,
	notify,
} from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";
import { now } from "@/lib/clock";
import { useAuth } from "@/modules/auth";
import { agentName, offeredProviders, providersStore } from "@/modules/chat/stores/providers";
import { useWorkspace } from "@/modules/projects";
import { ShellSlot } from "@/modules/shell";
import { terminalsService } from "@/modules/terminal/services/terminals.service";
import type { TerminalInfo } from "@/modules/terminal/types/terminal.types";
import { useWorkspaces } from "@/modules/workspaces";
import { mayDo } from "@/modules/workspaces/lib/members";
import { useTerminalAccess } from "@/modules/workspaces";

import { activityService, type RunHere } from "../services/activity.service";
import { machineService, type MachineStatus } from "../services/machine.service";
import { environmentsStore } from "../stores/environments";
import { placementsStore, scopeFor } from "../stores/placements";

const errorOf = (cause: unknown) =>
	cause instanceof Error ? cause.message : "The runner did not answer";
const gb = (bytes: number) => `${Math.round(bytes / 1024 ** 3)} GB`;
const duration = (start: string | null, end: string | null) => {
	if (!start) return "—";
	const seconds = Math.max(
		0,
		Math.round(((end ? Date.parse(end) : now()) - Date.parse(start)) / 1000),
	);
	return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};

/** The operational Machines and Agents views; settings remain the place to configure them. */
export function MachinesOverview(): JSX.Element {
	return <OperationsScreen kind="machines" />;
}
export function AgentsOverview(): JSX.Element {
	return <OperationsScreen kind="agents" />;
}

function OperationsScreen(props: { kind: "machines" | "agents" }): JSX.Element {
	const auth = useAuth();
	const workspace = useWorkspace();
	const workspaces = useWorkspaces();
	const terminalAccess = useTerminalAccess();
	const navigate = useNavigate();
	const route = useMatch(() => "/machines/:id?");
	const agentsRoute = useMatch(() => "/agents/:provider?");
	const machineId = () => route()?.params.id ?? null;
	const scope = () => scopeFor(machineId());
	const title = () => (props.kind === "machines" ? "Machines" : "Agents");
	const [machine, setMachine] = createSignal<MachineStatus | null>(null);
	const [runs, setRuns] = createSignal<RunHere[]>([]);
	const [terminals, setTerminals] = createSignal<TerminalInfo[]>([]);
	const [loading, setLoading] = createSignal(true);
	const [errors, setErrors] = createSignal<string[]>([]);
	const [stopping, setStopping] = createSignal<string | null>(null);
	const allowed = () => {
		const current = workspaces.current();
		return current
			? mayDo("startAgents", current.role, current.customRole, current.settings)
			: false;
	};
	createEffect(
		() => [auth.token(), scope()] as const,
		([token, where]) => {
			if (token) {
				untrack(() => void environmentsStore.load(token));
				void placementsStore.load(token);
				void providersStore.load(token, where);
			}
		},
	);
	createEffect(
		() => ({
			token: auth.token(),
			scope: scope(),
			kind: props.kind,
			environment: machineId(),
			projects: workspace.projects().map((project) => ({
				slug: project.slug,
				scope: scopeFor(placementsStore.environmentOf(project.slug)),
			})),
		}),
		(input) => {
			if (!input.token) return;
			let active = true;
			let busy = false;
			const token = input.token;
			setLoading(true);
			setMachine(null);
			setRuns([]);
			setTerminals([]);
			setErrors([]);
			const read = async () => {
				if (!active || busy || document.visibilityState !== "visible") return;
				busy = true;
				try {
					const selected =
						input.kind === "machines"
							? input.projects.filter((project) => project.scope === input.scope)
							: input.projects;
					const results = await Promise.allSettled([
						machineService.status(token, input.scope),
						// The runner refuses terminals to roles without them: not asked for at all.
						untrack(terminalAccess)
							? terminalsService.list(token, input.environment ?? undefined, true)
							: Promise.resolve([]),
						...selected.map(async (project) =>
							(await activityService.list(token, project.slug, project.scope)).map((run) => ({
								...run,
								scope: project.scope,
							})),
						),
					]);
					if (!active) return;
					if (results[0].status === "fulfilled") setMachine(results[0].value as MachineStatus);
					if (results[1].status === "fulfilled") setTerminals(results[1].value as TerminalInfo[]);
					setRuns(
						results
							.slice(2)
							.flatMap((result) =>
								result.status === "fulfilled" ? (result.value as RunHere[]) : [],
							),
					);
					setErrors(
						results.flatMap((result) =>
							result.status === "rejected" ? [errorOf(result.reason)] : [],
						),
					);
					setLoading(false);
				} finally {
					busy = false;
				}
			};
			void read();
			const timer = setInterval(() => void read(), 5_000);
			const visible = () => void read();
			document.addEventListener("visibilitychange", visible);
			return () => {
				active = false;
				clearInterval(timer);
				document.removeEventListener("visibilitychange", visible);
			};
		},
	);
	const filtered = () =>
		runs().filter(
			(run) => !agentsRoute()?.params.provider || run.provider === agentsRoute()?.params.provider,
		);
	const live = () => filtered().filter((run) => run.running || run.waiting);
	const recent = createMemo(() =>
		filtered()
			.filter((run) => !run.running && run.result)
			.sort((a, b) => (b.endedAt ?? "").localeCompare(a.endedAt ?? ""))
			.slice(0, 20),
	);
	const completed = () => recent().filter((run) => run.result !== "cancelled");
	const passed = () =>
		completed().length
			? `${Math.round((100 * completed().filter((run) => run.result === "done").length) / completed().length)}%`
			: "—";
	const openRun = (run: RunHere) =>
		navigate(`/chat/${encodeURIComponent(run.project)}/${encodeURIComponent(run.id)}`);
	async function stop(run: RunHere): Promise<void> {
		const token = auth.token();
		if (!token || stopping()) return;
		setStopping(run.id);
		try {
			await activityService.stop(token, run.id, run.scope);
			setRuns((list) =>
				list.map((row) => (row.id === run.id ? { ...row, running: false, waiting: false } : row)),
			);
		} catch (cause) {
			notify({ title: errorOf(cause), tone: "danger" });
		} finally {
			setStopping(null);
		}
	}
	const providerIds = () => [
		...new Set([
			...offeredProviders(providersStore.providers()).map((provider) => provider.id),
			...runs().map((run) => run.provider),
		]),
	];
	return (
		<>
			<ShellSlot name="panel">
				<Show
					when={props.kind === "machines"}
					fallback={
						<NavSection label="Agents">
							<NavLink
								label="All agents"
								href={workspaceHref("/agents")}
								current={!agentsRoute()?.params.provider}
							/>
							<For each={providerIds()}>
								{(id) => (
									<NavLink
										label={agentName(id)}
										icon={<AgentLogo id={id} name={agentName(id)} />}
										href={workspaceHref(`/agents/${encodeURIComponent(id)}`)}
										current={agentsRoute()?.params.provider === id}
									/>
								)}
							</For>
							<NavLink label="Add an agent" href={workspaceHref("/settings/agents")} />
						</NavSection>
					}
				>
					<NavSection label="Your machines">
						<NavLink
							label={machineId() ? "This machine" : (machine()?.info.hostname ?? "This machine")}
							icon={<LaptopIcon />}
							href={workspaceHref("/machines")}
							current={!machineId()}
						/>
						<For each={environmentsStore.environments()}>
							{(environment) => (
								<NavLink
									label={environment.label}
									icon={<LaptopIcon />}
									href={workspaceHref(`/machines/${environment.id}`)}
									current={machineId() === environment.id}
								/>
							)}
						</For>
						<NavLink label="Connect a machine" href={workspaceHref("/settings/machines")} />
					</NavSection>
				</Show>
			</ShellSlot>
			<Page width="lg">
				<PageHeader
					title={props.kind === "machines" ? (machine()?.info.hostname ?? title()) : title()}
					description={
						props.kind === "machines"
							? machine()
								? `${machine()?.info.system} · ${machine()?.info.cores} cores · ${gb(machine()?.info.memory.totalBytes ?? 0)} · Runner ${machine()?.info.runnerVersion}`
								: "Computers where your agents work"
							: `${providerIds().length} agents · ${live().filter((run) => !run.waiting).length} at work right now`
					}
					actions={
						<ButtonLink
							size="sm"
							href={workspaceHref(
								props.kind === "machines" ? "/settings/machines" : "/settings/agents",
							)}
						>
							{props.kind === "machines" ? "Manage machines" : "Add agent"}
						</ButtonLink>
					}
				/>
				<For each={[...new Set(errors())]}>{(error) => <Alert tone="danger" title={error} />}</For>
				<Show
					when={!loading()}
					fallback={
						<Stack gap={3}>
							<Skeleton class="h-24" />
							<Skeleton class="h-40" />
						</Stack>
					}
				>
					<Show
						when={props.kind === "agents"}
						fallback={
							<Show when={machine()}>
								{(current) => (
									<MachineMetrics
										stats={[
											{
												label: "CPU",
												value: `${current().info.cpuPercent}% · ${current().info.cores} cores`,
												percent: current().info.cpuPercent,
												tone: "accent",
											},
											{
												label: "Memory",
												value: `${gb(current().info.memory.usedBytes)} of ${gb(current().info.memory.totalBytes)}`,
												percent:
													(100 * current().info.memory.usedBytes) /
													Math.max(1, current().info.memory.totalBytes),
												tone: "accent",
											},
											{
												label: "Disk free",
												value: `${gb(current().info.disk.freeBytes)} of ${gb(current().info.disk.totalBytes)}`,
												percent:
													(100 * current().info.disk.freeBytes) /
													Math.max(1, current().info.disk.totalBytes),
												tone: "accent",
											},
										]}
									/>
								)}
							</Show>
						}
					>
						<MetricGrid>
							<MetricCard
								label="Working now"
								source="Live"
								value={String(live().filter((run) => !run.waiting).length)}
							/>
							<MetricCard
								label="Waiting on you"
								source="Live"
								value={String(live().filter((run) => run.waiting).length)}
							/>
							<MetricCard
								label="Latest runs"
								source="Recent threads"
								value={String(recent().length)}
							/>
							<MetricCard label="Passed" source="Latest runs" value={passed()} />
						</MetricGrid>
					</Show>
					<Section title={props.kind === "machines" ? "Running here" : "Live now"}>
						<Show
							when={live().length}
							fallback={
								<EmptyState
									title="No agents working right now"
									description="Start a thread to see its progress here."
								/>
							}
						>
							<div class="grid gap-3 md:grid-cols-2">
								<For each={live()}>
									{(run) => (
										<section class="surface-card flex min-w-0 flex-col gap-3 p-4">
											<div class="flex min-w-0 items-center gap-2">
												<AgentLogo id={run.provider} name={agentName(run.provider)} />
												<Text weight="medium" class="min-w-0 flex-1 truncate">
													{agentName(run.provider)}
												</Text>
												<Badge tone={run.waiting ? "warning" : "accent"} dot>
													{run.waiting ? "Needs you" : "Working"}
												</Badge>
											</div>
											<Text>{run.title}</Text>
											<Text size="caption" tone="subtle">
												{run.project} · {duration(run.startedAt, null)}
											</Text>
											<Show when={run.tool}>
												<Text size="caption" mono>
													{run.tool}
												</Text>
											</Show>
											<Show when={run.steps && run.steps.total > 0 ? run.steps : null}>
												{(steps) => (
													<>
														<ProgressBar
															value={steps().done / steps().total}
															label="Steps completed"
														/>
														<Text size="caption" tone="subtle">
															{steps().done} of {steps().total} steps
														</Text>
													</>
												)}
											</Show>
											<div class="flex flex-wrap gap-2">
												<Button
													size="sm"
													variant={run.waiting ? "primary" : "secondary"}
													onClick={() => openRun(run)}
												>
													{run.waiting ? "Answer" : "Open thread"}
												</Button>
												<Show when={allowed()}>
													<Button
														size="sm"
														disabled={stopping() !== null}
														onClick={() => void stop(run)}
													>
														Stop
													</Button>
												</Show>
											</div>
										</section>
									)}
								</For>
							</div>
						</Show>
					</Section>
					<Show
						when={props.kind === "machines"}
						fallback={
							<SectionCard title="Recent runs" note="Latest turn per thread">
								<Show when={recent().length} fallback={<EmptyState title="No runs yet" />}>
									<For each={recent()}>
										{(run) => (
											<CardRow
												icon={<AgentLogo id={run.provider} name={agentName(run.provider)} />}
												title={run.title}
												meta={`${agentName(run.provider)} · ${run.project} · ${duration(run.startedAt, run.endedAt)}`}
												action={
													<Badge
														tone={
															run.result === "error"
																? "danger"
																: run.result === "done"
																	? "success"
																	: "neutral"
														}
													>
														{run.result === "error"
															? "Failed"
															: run.result === "done"
																? "Passed"
																: "Cancelled"}
													</Badge>
												}
												onClick={() => openRun(run)}
											/>
										)}
									</For>
								</Show>
							</SectionCard>
						}
					>
						<Show when={terminalAccess()}>
							<SectionCard
								title="Terminals"
								action={
									<ButtonLink size="sm" href={workspaceHref("/terminal")}>
										Open terminals
									</ButtonLink>
								}
							>
								<Show when={terminals().length} fallback={<EmptyState title="No terminals open" />}>
									<For each={terminals()}>
										{(terminal) => (
											<CardRow
												icon={<TerminalIcon />}
												title={terminal.status?.command ?? terminal.title}
												meta={terminal.status?.cwd ?? terminal.cwd}
												action={
													<ButtonLink size="sm" href={workspaceHref(`/terminal/${terminal.id}`)}>
														Open
													</ButtonLink>
												}
											/>
										)}
									</For>
								</Show>
							</SectionCard>
						</Show>
						<SectionCard title="Runner">
							<CardRow
								title={`Grid runner ${machine()?.info.runnerVersion ?? ""}`}
								meta={machine()?.projectsDir}
								action={
									<ButtonLink size="sm" href={workspaceHref("/settings/machines")}>
										Manage
									</ButtonLink>
								}
							/>
							<CardRow
								title="Agents allowed here"
								meta={
									offeredProviders(providersStore.providers(scope()))
										.filter((provider) => provider.available)
										.map((provider) => provider.name)
										.join(", ") || "No agents installed"
								}
								action={
									<ButtonLink size="sm" href={workspaceHref("/settings/agents")}>
										Manage
									</ButtonLink>
								}
							/>
						</SectionCard>
					</Show>
				</Show>
			</Page>
		</>
	);
}
