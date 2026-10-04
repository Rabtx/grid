import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, Show, untrack } from "solid-js";

import {
	AgentLogo,
	Alert,
	ArrowUpIcon,
	Avatar,
	Badge,
	BackIcon,
	Button,
	ButtonLink,
	CheckNote,
	CommitRow,
	ConfirmDialog,
	DeployRow,
	EmptyState,
	ExternalIcon,
	FocusCard,
	HealthCell,
	HealthStrip,
	IconButton,
	iconButton,
	LinkButton,
	Menu,
	type MenuGroup,
	MoreIcon,
	CloudIcon,
	SettingsIcon,
	ShipHeading,
	ShipPage,
	ShipRows,
	ShipSectionTitle,
	Skeleton,
	Text,
	TextLink,
	notify,
} from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";
import { useAuth } from "@/modules/auth";
import { agentName } from "@/modules/chat/stores/providers";
import { placementsStore } from "@/modules/environments";
import { ShellSlot, useShell } from "@/modules/shell";

import {
	ago,
	bareUrl,
	envTitle,
	plural,
	rate,
	STATE_WORD,
	stateTone,
	deployMeta,
} from "../lib/ship-look";
import { shipService } from "../services/ship.service";
import type { EnvironmentDetail, HistoryEntry } from "../types/ship.types";

import { EnvironmentSettingsDialog } from "./environment-settings-dialog";
import { PromoteDialog } from "./promote-dialog";

const BADGE_TONE = {
	success: "success",
	accent: "accent",
	danger: "danger",
	neutral: "neutral",
	warning: "warning",
	violet: "accent",
} as const;

function message(cause: unknown, fallback: string): string {
	return cause instanceof Error ? cause.message : fallback;
}

/**
 * One environment (Figma 19 · Production): what is live and how healthy, what staging has that it
 * does not with the way to promote it, and its deploys, each one a roll back away.
 */
export function EnvironmentView(props: {
	project: string;
	name: string;
	onChanged: () => void;
	onBack: () => void;
}): JSX.Element {
	const auth = useAuth();
	const shell = useShell();
	const scope = () => placementsStore.scopeOf(props.project);
	const [detail, setDetail] = createSignal<EnvironmentDetail | null>(null);
	const [error, setError] = createSignal<string | null>(null);
	const [revision, setRevision] = createSignal(0);
	const [promoting, setPromoting] = createSignal(false);
	const [settingsOpen, setSettingsOpen] = createSignal(false);
	const [rollback, setRollback] = createSignal<HistoryEntry | null>(null);
	const [rollingBack, setRollingBack] = createSignal(false);

	createEffect(
		() => [auth.token(), props.project, props.name, revision()] as const,
		([token, project, name]) => {
			setError(null);
			if (!token) return;
			void shipService.environment(token, project, name).then(
				(next) => {
					if (project === untrack(() => props.project) && name === untrack(() => props.name))
						setDetail(next);
				},
				(cause) => {
					setDetail(null);
					setError(message(cause, "Could not read this environment"));
				},
			);
		},
	);

	// A deploy in flight or a watch running is followed until it settles.
	createEffect(
		() => {
			const current = detail();
			return Boolean(
				current && (current.state === "deploying" || current.watch?.outcome === "watching"),
			);
		},
		(busy) => {
			if (!busy) return;
			const timer = setInterval(() => setRevision((n) => n + 1), 15_000);
			return () => clearInterval(timer);
		},
	);

	const changed = () => {
		setRevision((n) => n + 1);
		props.onChanged();
	};

	async function rollBack(entry: HistoryEntry): Promise<void> {
		const token = auth.token();
		if (!token) return;
		setRollingBack(true);
		try {
			const done = await shipService.rollback(token, props.project, props.name, entry.id);
			notify({ title: `Rolling back to ${done.version}`, tone: "success" });
			setRollback(null);
			changed();
		} catch (cause) {
			notify({ title: message(cause, "Could not roll back"), tone: "danger" });
		} finally {
			setRollingBack(false);
		}
	}

	// Phones: what the desktop heading offers, behind the top bar's ⋯.
	const menuGroups = (): MenuGroup[] => {
		const current = detail();
		if (!current) return [];
		const items = [
			...(current.url ? [{ id: "site", label: "Open site", icon: <ExternalIcon /> }] : []),
			...(current.allowed
				? [{ id: "settings", label: "Environment settings", icon: <SettingsIcon /> }]
				: []),
		];
		return items.length ? [{ items }] : [];
	};
	const onMenu = (id: string) => {
		const url = detail()?.url;
		if (id === "site" && url) window.open(url, "_blank", "noreferrer");
		if (id === "settings") setSettingsOpen(true);
	};

	const who = (agent: string | null, author: string) =>
		agent ? (
			<AgentLogo id={agent} name={agentName(agent, scope())} />
		) : (
			<Avatar name={author} size="xs" />
		);

	const metaLine = (current: EnvironmentDetail) =>
		[
			bareUrl(current.url),
			current.host,
			current.version
				? `${current.version} deployed ${ago(current.deployedAt)}${current.deployedBy ? ` by ${current.deployedBy}` : ""}`
				: null,
		]
			.filter(Boolean)
			.join(" · ");

	const status = (entry: HistoryEntry) => {
		if (entry.state === "live")
			return (
				<Badge tone="success" dot>
					Live
				</Badge>
			);
		if (entry.state === "failed")
			return (
				<Badge tone="danger" dot>
					Build failed
				</Badge>
			);
		if (entry.state === "running")
			return (
				<Badge tone="accent" dot>
					Deploying
				</Badge>
			);
		return undefined;
	};
	const action = (current: EnvironmentDetail, entry: HistoryEntry) => {
		if (entry.state === "failed" && entry.logUrl)
			return (
				<TextLink href={entry.logUrl} target="_blank" rel="noreferrer">
					View log
				</TextLink>
			);
		if (entry.canRollback && current.allowed)
			return (
				<Button size="sm" variant="ghost" onClick={() => setRollback(entry)}>
					{shell.desktop() ? "Roll back to this" : "Roll back"}
				</Button>
			);
		return undefined;
	};

	return (
		<>
			<ShellSlot name="crumb">{envTitle(props.name)}</ShellSlot>
			<ShellSlot name="heading">
				<div class="flex min-w-0 flex-col items-center">
					<Text as="h1" tone="strong" weight="medium" size="body-lg" truncate>
						{envTitle(props.name)}
					</Text>
					<Text size="caption" tone="subtle" truncate>
						{detail()
							? [STATE_WORD[detail()?.state ?? "idle"], detail()?.version]
									.filter(Boolean)
									.join(" · ")
							: "Ship"}
					</Text>
				</div>
			</ShellSlot>
			<ShellSlot name="leading">
				<IconButton label="Ship" variant="secondary" shape="round" size="lg" onClick={props.onBack}>
					<BackIcon />
				</IconButton>
			</ShellSlot>
			<ShellSlot name="actions">
				<Show when={detail()?.allowed}>
					<IconButton label="Environment settings" size="sm" onClick={() => setSettingsOpen(true)}>
						<SettingsIcon size="sm" />
					</IconButton>
				</Show>
			</ShellSlot>
			<ShellSlot name="trailing">
				<Show when={menuGroups().length}>
					<Menu
						label={envTitle(props.name)}
						title={envTitle(props.name)}
						trigger={<MoreIcon />}
						triggerClass={iconButton({ size: "lg", shape: "round", variant: "secondary" })}
						placement="bottom-end"
						groups={menuGroups()}
						onSelect={onMenu}
					/>
				</Show>
			</ShellSlot>

			<ShipPage>
				<Show when={error()}>
					{(reason) => (
						<Alert
							tone="danger"
							title={reason()}
							action={
								<Button size="sm" onClick={() => setRevision((n) => n + 1)}>
									Try again
								</Button>
							}
						/>
					)}
				</Show>
				<Show
					when={detail()}
					fallback={
						<Show when={!error()}>
							<Skeleton class="h-14 w-72" />
							<Skeleton class="h-28" />
							<Skeleton class="h-56" />
						</Show>
					}
				>
					{(current) => (
						<>
							<ShipHeading
								title={envTitle(current().name)}
								badge={
									<Badge tone={BADGE_TONE[stateTone(current().state)]} dot>
										{STATE_WORD[current().state]}
									</Badge>
								}
								meta={metaLine(current())}
								actions={
									<Show when={current().url}>
										{(url) => (
											<ButtonLink size="sm" href={url()} target="_blank" rel="noreferrer">
												Open site
											</ButtonLink>
										)}
									</Show>
								}
							/>

							<HealthStrip>
								<HealthCell
									label="Error rate"
									value={
										current().health.errorRate
											? rate(current().health.errorRate?.value ?? 0)
											: undefined
									}
									note={
										current().health.errorRate
											? `Sentry · read ${ago(current().health.errorRate?.at ?? null)}`
											: "Sentry, through Pulse"
									}
									empty={
										<TextLink tone="accent" href={workspaceHref("/settings/connectors")}>
											Connect Sentry
										</TextLink>
									}
								/>
								<HealthCell
									label="p95 response"
									value={
										current().health.p95 === null
											? undefined
											: `${Math.round(current().health.p95 ?? 0)} ms`
									}
									note="Grid's checks · last 24h"
									empty={<Text tone="faint">{current().url ? "Checking soon" : "No address"}</Text>}
								/>
								<HealthCell
									label="Uptime"
									value={
										current().health.uptime === null
											? undefined
											: `${(current().health.uptime ?? 0).toFixed(2)}%`
									}
									note={
										current().health.checks
											? `${plural(current().health.checks, "check")} · 30 days`
											: "Grid's checks · 30 days"
									}
									empty={
										<Show
											when={!current().url && current().allowed}
											fallback={<Text tone="faint">Checking soon</Text>}
										>
											<LinkButton tone="accent" onClick={() => setSettingsOpen(true)}>
												Add the address
											</LinkButton>
										</Show>
									}
								/>
								<HealthCell
									label="Deploys"
									value={String(current().health.deploysWeek)}
									note="this week"
								/>
							</HealthStrip>

							<Show when={current().watch}>
								{(watch) => (
									<Show
										when={watch().outcome === "watching"}
										fallback={
											<Show
												when={
													(watch().outcome === "rolled-back" || watch().outcome === "failed") &&
													Date.now() - Date.parse(watch().startedAt) < 86_400_000
												}
											>
												<Alert
													tone="danger"
													title={watch().detail ?? "The last promotion did not go cleanly"}
												/>
											</Show>
										}
									>
										<Alert tone="accent" title={`Watching ${watch().version} for 15 minutes`}>
											{watch().until
												? `If the site stops answering before ${new Date(watch().until ?? "").toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}, Grid rolls back to ${watch().previous.version}.`
												: `Waiting for ${watch().version} to go live.`}
										</Alert>
									</Show>
								)}
							</Show>

							<Show when={current().promotion}>
								{(promotion) => (
									<FocusCard
										icon={<ArrowUpIcon />}
										title={
											promotion().ahead === null
												? `${promotion().from.version} is not in ${current().name} yet`
												: `${envTitle(promotion().from.name)} is ${plural(promotion().ahead ?? 0, "commit")} ahead`
										}
										meta={[
											promotion().from.version,
											promotion().from.url ? `on ${bareUrl(promotion().from.url)}` : null,
											promotion().checks.total
												? promotion().checks.failed
													? `${promotion().checks.failed} failing`
													: promotion().checks.pending
														? "checks running"
														: "every check passed"
												: null,
										]
											.filter(Boolean)
											.join(" · ")}
										actions={
											<>
												<Show when={current().sha}>
													<ButtonLink
														size="sm"
														variant="ghost"
														href={`https://github.com/${current().repository}/compare/${current().sha}...${promotion().from.sha}`}
														target="_blank"
														rel="noreferrer"
													>
														View diff
													</ButtonLink>
												</Show>
												<Button
													size="sm"
													variant="primary"
													disabled={!current().allowed}
													title={current().allowed ? undefined : "Your role can't deploy here"}
													onClick={() =>
														promotion().ready ? setPromoting(true) : setSettingsOpen(true)
													}
												>
													{promotion().ready
														? `Promote to ${current().name}`
														: "Set how it deploys"}
												</Button>
											</>
										}
										footer={
											<>
												<Show when={promotion().checks.total}>
													<CheckNote ok={promotion().checks.failed === 0}>
														{promotion().checks.failed
															? `${promotion().checks.failed} of ${promotion().checks.total} checks failed`
															: `${plural(promotion().checks.passed, "check")} passed`}
													</CheckNote>
												</Show>
												<Show when={promotion().migrations.length}>
													<CheckNote>
														{plural(promotion().migrations.length, "migration")}
													</CheckNote>
												</Show>
												<Text size="caption" tone="subtle">
													{promotion().method}
												</Text>
											</>
										}
									>
										<For each={promotion().commits.slice(0, 6)}>
											{(commit) => (
												<CommitRow
													who={who(commit.agent, commit.author)}
													title={commit.title}
													by={commit.agent ? agentName(commit.agent, scope()) : commit.author}
													sha={commit.sha}
												/>
											)}
										</For>
										<Show when={promotion().commits.length > 6}>
											<Text size="caption" tone="subtle">
												{`and ${promotion().commits.length - 6} more`}
											</Text>
										</Show>
									</FocusCard>
								)}
							</Show>

							<ShipSectionTitle note={current().host ?? undefined}>Deploy history</ShipSectionTitle>
							<Show
								when={current().history.length}
								fallback={<EmptyState icon={<CloudIcon size="md" />} title="No deploys yet" />}
							>
								<ShipRows>
									<For each={current().history}>
										{(entry) => (
											<DeployRow
												version={entry.version}
												title={entry.title}
												meta={
													<>
														{who(entry.agent, entry.author)}
														<span class="truncate">
															{deployMeta({
																...entry,
																author: entry.agent
																	? agentName(entry.agent, scope())
																	: entry.author,
															})}
														</span>
													</>
												}
												status={status(entry)}
												action={action(current(), entry)}
											/>
										)}
									</For>
								</ShipRows>
							</Show>

							<PromoteDialog
								open={promoting()}
								project={props.project}
								environment={current()}
								onClose={() => setPromoting(false)}
								onDone={() => {
									setPromoting(false);
									changed();
								}}
							/>
							<EnvironmentSettingsDialog
								open={settingsOpen()}
								project={props.project}
								environment={current()}
								onClose={() => setSettingsOpen(false)}
								onSaved={() => {
									setSettingsOpen(false);
									changed();
								}}
							/>
							<ConfirmDialog
								open={rollback() !== null}
								onClose={() => setRollback(null)}
								onConfirm={() => {
									const entry = rollback();
									if (entry) void rollBack(entry);
								}}
								stayOpen
								pending={rollingBack()}
								title={`Roll back to ${rollback()?.version ?? ""}?`}
								description={`${current().name} goes back to “${rollback()?.title ?? ""}”. Grid runs the deploy that shipped it again.`}
								confirm="Roll back"
								danger
							/>
						</>
					)}
				</Show>
			</ShipPage>
		</>
	);
}
