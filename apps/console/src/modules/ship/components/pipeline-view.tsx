import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, Show, untrack } from "solid-js";

import {
	AgentLogo,
	Alert,
	BackIcon,
	Badge,
	Button,
	ButtonLink,
	CheckRunRow,
	DiffCard,
	ExternalIcon,
	FocusCard,
	IconButton,
	iconButton,
	LogExcerpt,
	Menu,
	MoreIcon,
	notify,
	RestoreIcon,
	ShipHeading,
	ShipPage,
	ShipRows,
	ShipSectionTitle,
	Skeleton,
	Text,
	ToolIcon,
} from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";
import { useAuth } from "@/modules/auth";
import { diffRows } from "@/modules/chat/lib/diff";
import { agentName } from "@/modules/chat/stores/providers";
import { placementsStore } from "@/modules/environments";
import { FixWithAgentSheet } from "@/modules/github/components/fix-with-agent-sheet";
import { ShellSlot } from "@/modules/shell";

import { ago, checkNote, plural } from "../lib/ship-look";
import { shipService } from "../services/ship.service";
import type { PipelineDetail } from "../types/ship.types";

function message(cause: unknown, fallback: string): string {
	return cause instanceof Error ? cause.message : fallback;
}

/**
 * A pipeline (Figma 19 · CI run): the checks on main or on a pull request, why the one that
 * failed did, and the Grid thread fixing it — its answer, its change, and pushing it.
 */
export function PipelineView(props: {
	project: string;
	id: string;
	onChanged: () => void;
	onBack: () => void;
}): JSX.Element {
	const auth = useAuth();
	const scope = () => placementsStore.scopeOf(props.project);
	const [detail, setDetail] = createSignal<PipelineDetail | null>(null);
	const [error, setError] = createSignal<string | null>(null);
	const [revision, setRevision] = createSignal(0);
	const [busy, setBusy] = createSignal<string | null>(null);
	const [fixing, setFixing] = createSignal(false);
	// The failed log takes a while to read: it follows the checks.
	const [log, setLog] = createSignal<{ check: string; excerpt: string } | null | undefined>();

	createEffect(
		() => [auth.token(), props.project, props.id, revision()] as const,
		([token, project, id]) => {
			setError(null);
			if (!token) return;
			void shipService.pipeline(token, project, id).then(
				(next) => {
					if (project === untrack(() => props.project) && id === untrack(() => props.id))
						setDetail(next);
				},
				(cause) => {
					setDetail(null);
					setError(message(cause, "Could not read these checks"));
				},
			);
		},
	);

	createEffect(
		() => [auth.token(), props.project, props.id, detail()?.failing ?? null] as const,
		([token, project, id, failing]) => {
			setLog(undefined);
			if (!token || !failing) return;
			void shipService.failureLog(token, project, id).then(
				(found) => {
					if (project === untrack(() => props.project) && id === untrack(() => props.id))
						setLog(found);
				},
				() => setLog(null),
			);
		},
	);

	// Checks still running, or a thread still working, are followed until they settle.
	createEffect(
		() => Boolean(detail()?.summary.pending || detail()?.thread?.busy),
		(running) => {
			if (!running) return;
			const timer = setInterval(() => setRevision((n) => n + 1), 15_000);
			return () => clearInterval(timer);
		},
	);

	async function act(key: string, run: (token: string) => Promise<void>, done: string) {
		const token = auth.token();
		if (!token || busy()) return;
		setBusy(key);
		try {
			await run(token);
			notify({ title: done, tone: "success" });
			setRevision((n) => n + 1);
			props.onChanged();
		} catch (cause) {
			notify({ title: message(cause, "That did not work"), tone: "danger" });
		} finally {
			setBusy(null);
		}
	}

	const rerun = (failed: boolean, check?: string) =>
		act(
			check ? `rerun:${check}` : failed ? "rerun:failed" : "rerun:all",
			(token) => shipService.rerun(token, props.project, props.id, { failed, check }),
			check
				? `Running ${check} again`
				: failed
					? "Running the failed checks again"
					: "Running every check again",
		);

	const badge = (current: PipelineDetail) => {
		if (current.summary.failed)
			return (
				<Badge tone="danger" dot>
					{`${current.summary.failed} failing`}
				</Badge>
			);
		if (current.summary.pending)
			return (
				<Badge tone="accent" dot>
					Running
				</Badge>
			);
		if (current.summary.total)
			return (
				<Badge tone="success" dot>
					Passing
				</Badge>
			);
		return <Badge>No checks</Badge>;
	};

	const meta = (current: PipelineDetail) =>
		[
			current.checks.some((check) => check.run !== null) ? "GitHub Actions" : null,
			`pushed by ${current.agent ? agentName(current.agent, scope()) : current.author}${current.at ? ` ${ago(current.at)}` : ""}`,
			current.number === null ? `commit ${current.sha.slice(0, 7)}` : `branch ${current.branch}`,
		]
			.filter(Boolean)
			.join(" · ");

	const title = (current: PipelineDetail) => `${current.label} · ${current.title}`;

	return (
		<>
			<ShellSlot name="crumb">{detail()?.label ?? props.id}</ShellSlot>
			<ShellSlot name="heading">
				<div class="flex min-w-0 flex-col items-center">
					<Text as="h1" tone="strong" weight="medium" size="body-lg" truncate>
						{detail()?.label ?? (props.id === "main" ? "main" : `PR #${props.id}`)}
					</Text>
					<Text size="caption" tone="subtle" truncate>
						{detail()
							? detail()?.summary.failed
								? `${plural(detail()?.summary.failed ?? 0, "check")} failing`
								: "Checks"
							: "Ship"}
					</Text>
				</div>
			</ShellSlot>
			<ShellSlot name="trailing">
				<Show when={detail()}>
					{(current) => (
						<Menu
							label={current().label}
							title={current().label}
							trigger={<MoreIcon />}
							triggerClass={iconButton({ size: "lg", shape: "round", variant: "secondary" })}
							placement="bottom-end"
							groups={[
								{
									items: [
										...(current().allowed.rerun &&
										current().checks.some((check) => check.run !== null)
											? [{ id: "rerun", label: "Re-run all", icon: <RestoreIcon /> }]
											: []),
										{ id: "github", label: "Open in GitHub", icon: <ExternalIcon /> },
									],
								},
							]}
							onSelect={(id) => {
								if (id === "rerun") void rerun(false);
								if (id === "github") window.open(current().url, "_blank", "noreferrer");
							}}
						/>
					)}
				</Show>
			</ShellSlot>
			<ShellSlot name="leading">
				<IconButton label="Ship" variant="secondary" shape="round" size="lg" onClick={props.onBack}>
					<BackIcon />
				</IconButton>
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
							<Skeleton class="h-14 w-96" />
							<Skeleton class="h-52" />
						</Show>
					}
				>
					{(current) => (
						<>
							<ShipHeading
								title={title(current())}
								badge={badge(current())}
								meta={meta(current())}
								actions={
									<>
										<Show
											when={
												current().allowed.rerun &&
												current().checks.some((check) => check.run !== null)
											}
										>
											<Button
												size="sm"
												disabled={busy() !== null}
												onClick={() => void rerun(false)}
											>
												Re-run all
											</Button>
										</Show>
										<ButtonLink
											size="sm"
											variant="ghost"
											href={current().url}
											target="_blank"
											rel="noreferrer"
										>
											Open in GitHub
										</ButtonLink>
									</>
								}
							/>

							<Show
								when={current().checks.length}
								fallback={<Text tone="subtle">No checks have run on this commit.</Text>}
							>
								<ShipRows>
									<For each={current().checks}>
										{(check) => (
											<CheckRunRow state={check.state} name={check.name} note={checkNote(check)} />
										)}
									</For>
								</ShipRows>
							</Show>

							<Show when={current().failing}>
								{(failing) => (
									<>
										<ShipSectionTitle>{`Why ${failing()} failed`}</ShipSectionTitle>
										<Show
											when={log()}
											fallback={
												<Show
													when={log() === undefined}
													fallback={<Text tone="subtle">GitHub kept no log of what failed.</Text>}
												>
													<Skeleton class="h-32" />
												</Show>
											}
										>
											{(found) => <LogExcerpt text={found().excerpt} />}
										</Show>
									</>
								)}
							</Show>

							<Show
								when={current().thread}
								fallback={
									<Show when={current().summary.failed}>
										<Show
											when={current().number !== null && current().allowed.push}
											fallback={
												<Show when={current().allowed.rerun}>
													<div class="flex flex-wrap gap-2">
														<Button
															size="sm"
															disabled={busy() !== null}
															onClick={() => void rerun(true)}
														>
															Re-run failed
														</Button>
													</div>
												</Show>
											}
										>
											<FocusCard
												icon={<ToolIcon />}
												title="Hand it to an agent"
												meta="It reads the failing log, fixes it on this pull request's branch, and runs the checks again"
												actions={
													<>
														<Show when={current().allowed.rerun}>
															<Button
																size="sm"
																variant="ghost"
																disabled={busy() !== null}
																onClick={() => void rerun(true)}
															>
																Re-run failed
															</Button>
														</Show>
														<Button size="sm" variant="primary" onClick={() => setFixing(true)}>
															Fix with an agent
														</Button>
													</>
												}
											/>
										</Show>
									</Show>
								}
							>
								{(thread) => (
									<FocusCard
										icon={
											<AgentLogo
												id={thread().provider}
												name={agentName(thread().provider, scope())}
											/>
										}
										title={
											thread().busy
												? `${agentName(thread().provider, scope())} is working on it`
												: thread().diff.length
													? `${agentName(thread().provider, scope())} has a fix`
													: `${agentName(thread().provider, scope())} is on this pull request`
										}
										meta={thread().title}
										badge={
											<Show when={!thread().busy && (thread().diff.length || thread().unpushed)}>
												<Badge tone="accent" dot>
													Fix ready
												</Badge>
											</Show>
										}
										footer={
											<>
												<Show
													when={
														current().allowed.push &&
														(thread().diff.length || thread().unpushed) &&
														current().number !== null
													}
												>
													<Button
														size="sm"
														variant="primary"
														disabled={busy() !== null || thread().busy}
														onClick={() =>
															void act(
																"push",
																(token) =>
																	shipService.pushFix(token, props.project, current().number ?? 0),
																`Asked ${agentName(thread().provider, scope())} to push`,
															)
														}
													>
														{`Push fix to #${current().number}`}
													</Button>
												</Show>
												<ButtonLink
													size="sm"
													variant="ghost"
													href={workspaceHref(`/chat/${props.project}/${thread().id}`)}
												>
													Open thread
												</ButtonLink>
												<Show when={current().failing && current().allowed.rerun}>
													<Button
														size="sm"
														variant="ghost"
														disabled={busy() !== null}
														onClick={() => void rerun(true, current().failing ?? undefined)}
													>
														{`Re-run ${current().failing ?? ""}`}
													</Button>
												</Show>
											</>
										}
									>
										<Show when={thread().reply}>
											<Text class="line-clamp-6 whitespace-pre-line">{thread().reply}</Text>
										</Show>
										<For each={thread().diff.slice(0, 2)}>
											{(file) => (
												<DiffCard
													path={file.path}
													added={file.added}
													removed={file.removed}
													lines={diffRows(file)}
													limit={24}
												/>
											)}
										</For>
										<Show when={thread().diff.length > 2}>
											<Text size="caption" tone="subtle">
												{`and ${plural(thread().diff.length - 2, "more file")}`}
											</Text>
										</Show>
									</FocusCard>
								)}
							</Show>

							<Show when={current().number}>
								{(number) => (
									<FixWithAgentSheet
										open={fixing()}
										project={props.project}
										number={number()}
										onClose={() => setFixing(false)}
										onStarted={() => props.onChanged()}
									/>
								)}
							</Show>
						</>
					)}
				</Show>
			</ShipPage>
		</>
	);
}
