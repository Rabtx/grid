import { useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, onSettled, Show } from "solid-js";

import {
	AmountRow,
	Alert,
	BoltIcon,
	Button,
	CardRow,
	CheckIcon,
	Dialog,
	Field,
	Figures,
	GlobeIcon,
	IconButton,
	Input,
	LinkButton,
	MainAside,
	MetricCard,
	MetricGrid,
	notify,
	PlusIcon,
	RestoreIcon,
	Row,
	SectionCard,
	Segmented,
	Skeleton,
	Spinner,
	SplitBar,
	Stack,
	Text,
	CloseIcon,
} from "@/kit";
import { useAuth } from "@/modules/auth";
import { draftsStore } from "@/modules/chat/stores/drafts";
import { useWorkspace } from "@/modules/projects";
import { relativeTime } from "@/modules/projects/lib/relative-time";
import { ShellSlot, useShell } from "@/modules/shell";
import { useWorkspaces } from "@/modules/workspaces";
import { isAdmin } from "@/modules/workspaces/lib/members";
import { workspacesService } from "@/modules/workspaces/services/workspaces.service";
import type { Finance } from "@/modules/workspaces/types/workspace.types";

import {
	change,
	count,
	duration,
	investorDraft,
	money,
	percent,
	PERIODS,
	runway,
} from "../lib/pulse";
import { type Insight, type PulseView, pulseService } from "../services/pulse.service";
import { HomeNav } from "./home-nav";

// While an agent reads the numbers, look again this often.
const READING_POLL_MS = 5_000;

const SOURCE_NAMES: Record<keyof PulseView["sources"], string> = {
	stripe: "Stripe",
	posthog: "PostHog",
	sentry: "Sentry",
};

const INSIGHT_ICONS: Record<Insight["tone"], () => JSX.Element> = {
	good: () => <CheckIcon />,
	warn: () => <BoltIcon />,
	info: () => <GlobeIcon />,
};

function reason(cause: unknown, fallback: string): string {
	return cause instanceof Error && cause.message ? cause.message : fallback;
}

/**
 * Home → Pulse (Figma 07): the company at a glance. Revenue, users, activation and errors from the
 * services the workspace connected, read by an agent in a thread anyone can open; what shipped,
 * straight from GitHub; how long the money lasts; and what is worth knowing.
 */
export function PulseScreen(): JSX.Element {
	const auth = useAuth();
	const shell = useShell();
	const navigate = useNavigate();
	const workspaces = useWorkspaces();
	const workspace = useWorkspace();
	const [days, setDays] = createSignal("30");
	const [view, setView] = createSignal<PulseView | null>(null);
	const [error, setError] = createSignal<string | null>(null);
	const [editing, setEditing] = createSignal(false);
	let timer: ReturnType<typeof setTimeout> | undefined;
	let stopped = false;

	const name = () => workspaces.current()?.name ?? "Your company";
	const finance = () => workspaces.current()?.settings?.finance;

	async function load(): Promise<void> {
		const token = auth.token();
		if (!token) return;
		clearTimeout(timer);
		let next: PulseView | null = null;
		try {
			next = await pulseService.view(token, Number(days()));
			setView(next);
			setError(null);
		} catch (cause) {
			setError(reason(cause, "Could not reach this machine's runner"));
		}
		// From what came back: the signal settles after this function has moved on.
		if (!stopped && next?.reading) timer = setTimeout(() => void load(), READING_POLL_MS);
	}
	createEffect(
		() => [auth.token(), days(), workspaces.current()?.slug] as const,
		([token]) => {
			if (token) void load();
		},
	);
	onSettled(() => () => {
		stopped = true;
		clearTimeout(timer);
	});

	async function refresh(): Promise<void> {
		const token = auth.token();
		if (!token) return;
		try {
			await pulseService.refresh(token, Number(days()));
			setView((current) => (current ? { ...current, reading: true } : current));
			timer = setTimeout(() => void load(), READING_POLL_MS);
		} catch (cause) {
			notify({ title: "Not read", description: reason(cause, "Try again") });
		}
	}

	/** The update is written in a thread like any other work: the draft waits in its composer. */
	function draftUpdate(): void {
		const current = view();
		const slug = current?.snapshot?.project ?? workspace.projects()[0]?.slug;
		if (!current || !slug) {
			notify({ title: "Add a project first", description: "Agents write inside a project." });
			return;
		}
		draftsStore.set(slug, investorDraft(current, name()));
		navigate(`/chat/${slug}`);
	}

	const threadHref = () => {
		const snapshot = view()?.snapshot;
		return snapshot?.project && snapshot.thread
			? `/chat/${snapshot.project}/${snapshot.thread}`
			: null;
	};

	const reading = () => view()?.snapshot?.reading ?? null;
	const sources = () => view()?.sources;
	const connectedNames = () =>
		(Object.keys(SOURCE_NAMES) as (keyof PulseView["sources"])[])
			.filter((key) => sources()?.[key])
			.map((key) => SOURCE_NAMES[key]);
	const subtitle = () => {
		const from = [...connectedNames(), "GitHub"];
		return `${name()} at a glance · from ${from.length > 1 ? `${from.slice(0, -1).join(", ")} and ${from.at(-1)}` : from[0]}`;
	};
	const mrr = () => reading()?.mrr ?? null;
	const money_ = () => runway(finance(), mrr()?.value ?? null);
	const pulseLine = () => {
		const value = mrr();
		if (!value?.change) return undefined;
		return `MRR ${value.change > 0 ? "up" : "down"} ${Math.abs(Math.round(value.change))}% in ${days()} days`;
	};

	/** A metric's card: its number, or why there is none and what to do. */
	const metric = (input: {
		label: string;
		source: keyof PulseView["sources"];
		key: "mrr" | "activeUsers" | "activation" | "errorRate";
		format: (value: number) => string;
		kind: "percent" | "points";
		lowerIsBetter?: boolean;
	}) => {
		const value = () => reading()?.[input.key] ?? null;
		const empty = () => {
			if (!sources()?.[input.source])
				return (
					<Stack gap={1.5} align="start">
						<Text size="caption" tone="subtle">
							Connect {SOURCE_NAMES[input.source]} to see it.
						</Text>
						<LinkButton tone="accent" onClick={() => navigate("/settings/connectors")}>
							Connect
						</LinkButton>
					</Stack>
				);
			if (view()?.reading && !value())
				return (
					<Row gap={2}>
						<Spinner label="Reading" />
						<Text size="caption" tone="subtle">
							Reading…
						</Text>
					</Row>
				);
			return (
				<Text size="caption" tone="subtle">
					{reading()?.missing[input.key] ?? "Not read yet"}
				</Text>
			);
		};
		return (
			<MetricCard
				label={input.label}
				source={SOURCE_NAMES[input.source]}
				value={value() ? input.format(value()?.value ?? 0) : undefined}
				change={
					value()
						? change(
								value() as NonNullable<ReturnType<typeof value>>,
								input.kind,
								input.lowerIsBetter,
							)
						: undefined
				}
				series={value()?.series}
				empty={empty()}
			/>
		);
	};

	return (
		<div class="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
			<ShellSlot name="crumb">Pulse</ShellSlot>
			<ShellSlot name="subtitle">{`Last ${days()} days`}</ShellSlot>
			<ShellSlot name="heading">
				<div class="flex min-w-0 flex-col items-center">
					<Text as="h1" tone="strong" weight="medium" size="body-lg" truncate>
						Pulse
					</Text>
					<Text size="caption" tone="subtle" truncate>
						{`Last ${days()} days`}
					</Text>
				</div>
			</ShellSlot>

			<div class="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pt-4 pb-8 md:px-10 md:pt-10 lg:gap-5">
				<HomeNav current="pulse" pulse={pulseLine()} />
				<header class="flex flex-wrap items-end justify-between gap-3 max-lg:hidden">
					<div class="flex min-w-0 flex-col gap-1">
						<Text as="h1" size="headline" tone="strong" weight="medium">
							Pulse
						</Text>
						<Text size="body-lg">{subtitle()}</Text>
					</div>
					<Row gap={3}>
						<Segmented<string>
							label="Period"
							size="sm"
							value={days()}
							onChange={setDays}
							options={PERIODS}
						/>
						<Button size="sm" disabled={!view()} onClick={draftUpdate}>
							Draft investor update
						</Button>
					</Row>
				</header>

				<Show when={error()}>
					{(message) => (
						<Alert
							tone="danger"
							title={message()}
							action={
								<Button size="sm" onClick={() => void load()}>
									Try again
								</Button>
							}
						/>
					)}
				</Show>

				<Show
					when={view()}
					fallback={
						<Show when={!error()}>
							<MetricGrid>
								<Skeleton class="h-32" />
								<Skeleton class="h-32" />
								<Skeleton class="h-32" />
								<Skeleton class="h-32" />
							</MetricGrid>
						</Show>
					}
				>
					{(current) => (
						<>
							<MetricGrid>
								{metric({
									label: "MRR",
									source: "stripe",
									key: "mrr",
									format: (value) => money(value, mrr()?.currency),
									kind: "percent",
								})}
								{metric({
									label: "Active users",
									source: "posthog",
									key: "activeUsers",
									format: count,
									kind: "percent",
								})}
								{metric({
									label: "Activation",
									source: "posthog",
									key: "activation",
									format: percent,
									kind: "points",
								})}
								{metric({
									label: "Error rate",
									source: "sentry",
									key: "errorRate",
									format: percent,
									kind: "percent",
									lowerIsBetter: true,
								})}
							</MetricGrid>

							<MainAside
								main={
									<SectionCard title="Shipping" note="GitHub">
										<div class="flex flex-col gap-4 px-4.5 pt-1 pb-4.5">
											<Figures
												items={[
													{ value: count(current().shipping.deploys), label: "Deploys" },
													{ value: count(current().shipping.merged), label: "PRs merged" },
													{ value: duration(current().shipping.leadTimeHours), label: "Lead time" },
												]}
											/>
											<Show
												when={current().shipping.merged > 0}
												fallback={
													<Text size="caption" tone="subtle">
														{current().shipping.repositories === 0
															? "No project's folder is on GitHub yet."
															: `Nothing merged in the last ${days()} days.`}
													</Text>
												}
											>
												<SplitBar
													label={`Who merged the ${current().shipping.merged} PRs`}
													parts={[
														{ label: "Agents", value: current().shipping.byAgents, tone: "accent" },
														{ label: "People", value: current().shipping.byPeople, tone: "violet" },
													]}
												/>
											</Show>
										</div>
									</SectionCard>
								}
								aside={
									<SectionCard
										title="Runway"
										action={
											<Row gap={3}>
												<Show when={!shell.desktop()}>
													<Button size="sm" onClick={draftUpdate}>
														Investor update
													</Button>
												</Show>
												<Show when={isAdmin(workspaces.current()?.role)}>
													<LinkButton onClick={() => setEditing(true)}>
														{money_() ? "Edit" : "Set up"}
													</LinkButton>
												</Show>
											</Row>
										}
									>
										<div class="flex flex-col px-4.5 pt-1 pb-3">
											<Show
												when={money_()}
												fallback={
													<Text size="caption" tone="subtle">
														Add cash in the bank and monthly costs to see how long the money lasts.
													</Text>
												}
											>
												{(value) => (
													<>
														<p class="flex items-baseline gap-2 pb-2">
															<Text as="span" size="headline" tone="strong">
																{value().months === null
																	? "Profitable"
																	: `${Math.floor(value().months ?? 0)} months`}
															</Text>
															<Text as="span" size="caption" tone="subtle">
																{value().burn > 0
																	? `at ${money(value().burn, value().currency)} a month`
																	: "revenue covers the costs"}
															</Text>
														</p>
														<For each={finance()?.costs ?? []}>
															{(cost) => (
																<AmountRow
																	label={cost.label}
																	amount={money(cost.monthly, value().currency)}
																/>
															)}
														</For>
													</>
												)}
											</Show>
										</div>
									</SectionCard>
								}
							/>

							<SectionCard
								title="Worth knowing"
								action={
									<Row gap={2}>
										<Text size="caption" tone="subtle">
											{current().reading
												? "Reading…"
												: current().snapshot
													? `Found by Grid · ${relativeTime(current().snapshot?.at ?? "")}`
													: "Found by Grid"}
										</Text>
										<Show when={connectedNames().length > 0}>
											<IconButton
												label="Read the numbers again"
												size="sm"
												disabled={current().reading}
												onClick={() => void refresh()}
											>
												<RestoreIcon />
											</IconButton>
										</Show>
									</Row>
								}
							>
								<Show
									when={(reading()?.insights.length ?? 0) > 0}
									fallback={
										<div class="px-4.5 pt-1 pb-4.5">
											<Text size="caption" tone="subtle">
												{connectedNames().length === 0
													? "Connect Stripe, PostHog or Sentry and Grid reads what is worth knowing every day."
													: (current().snapshot?.error ??
														(current().reading
															? "An agent is reading your numbers."
															: "Nothing yet."))}
											</Text>
										</div>
									}
								>
									<For each={reading()?.insights ?? []}>
										{(insight) => (
											<CardRow
												icon={INSIGHT_ICONS[insight.tone]()}
												tone={
													insight.tone === "good"
														? "success"
														: insight.tone === "warn"
															? "warning"
															: undefined
												}
												title={insight.title}
												meta={`${insight.source} · ${insight.detail}`}
											/>
										)}
									</For>
								</Show>
								<Show when={threadHref()}>
									{(href) => (
										<div class="px-4.5 pb-3.5">
											<LinkButton onClick={() => navigate(href())}>
												Open the thread it was read in
											</LinkButton>
										</div>
									)}
								</Show>
							</SectionCard>
						</>
					)}
				</Show>
			</div>

			<Show when={editing()}>
				<RunwayDialog
					finance={finance()}
					onClose={() => setEditing(false)}
					onSave={async (next) => {
						const token = auth.token(),
							ws = workspaces.current()?.slug;
						if (!token || !ws) return false;
						try {
							await workspacesService.update(token, ws, { settings: { finance: next } });
							workspaces.refresh();
							return true;
						} catch (cause) {
							notify({ title: "Not saved", description: reason(cause, "Try again") });
							return false;
						}
					}}
				/>
			</Show>
		</div>
	);
}

/** Cash in the bank and what the company spends each month, for Runway. */
function RunwayDialog(props: {
	finance: Finance | undefined;
	onClose: () => void;
	onSave: (finance: Finance) => Promise<boolean>;
}): JSX.Element {
	const [cash, setCash] = createSignal(props.finance?.cash?.toString() ?? "");
	const [currency, setCurrency] = createSignal(props.finance?.currency ?? "USD");
	const [costs, setCosts] = createSignal(
		(props.finance?.costs?.length
			? props.finance.costs
			: [
					{ label: "AI models", monthly: 0 },
					{ label: "Cloud", monthly: 0 },
					{ label: "Tools", monthly: 0 },
				]
		).map((item) => ({ label: item.label, monthly: item.monthly ? String(item.monthly) : "" })),
	);
	const [busy, setBusy] = createSignal(false);
	const valid = () =>
		/^\d+(\.\d+)?$/.test(cash().trim()) &&
		/^[A-Z]{3}$/.test(currency()) &&
		costs().every(
			(item) => item.label.trim() && (!item.monthly || /^\d+(\.\d+)?$/.test(item.monthly)),
		);

	async function save(): Promise<void> {
		if (!valid() || busy()) return;
		setBusy(true);
		const done = await props.onSave({
			cash: Number(cash()),
			currency: currency(),
			costs: costs()
				.filter((item) => item.label.trim())
				.map((item) => ({ label: item.label.trim(), monthly: Number(item.monthly || 0) })),
		});
		setBusy(false);
		if (done) props.onClose();
	}

	return (
		<Dialog
			open={true}
			title="Runway"
			description="Cash in the bank and what the company spends each month. Revenue comes from Stripe."
			onClose={props.onClose}
			footer={
				<>
					<Button onClick={props.onClose}>Cancel</Button>
					<Button variant="primary" disabled={!valid() || busy()} onClick={() => void save()}>
						<Show when={busy()} fallback="Save">
							<Spinner /> Saving…
						</Show>
					</Button>
				</>
			}
		>
			<Stack gap={4}>
				<Row gap={3}>
					<Field label="Cash in the bank">
						{(id) => (
							<Input
								id={id}
								inputmode="decimal"
								placeholder="250000"
								value={cash()}
								onInput={(event) => setCash(event.currentTarget.value)}
							/>
						)}
					</Field>
					<Field label="Currency">
						{(id) => (
							<Input
								id={id}
								maxlength={3}
								value={currency()}
								onInput={(event) => setCurrency(event.currentTarget.value.toUpperCase())}
							/>
						)}
					</Field>
				</Row>
				<Stack gap={2}>
					<Text size="caption" tone="subtle">
						Monthly costs
					</Text>
					<For each={costs()}>
						{(item, index) => (
							<Row gap={2}>
								<Input
									aria-label="What"
									value={item.label}
									onInput={(event) =>
										setCosts(
											costs().map((cost, at) =>
												at === index() ? { ...cost, label: event.currentTarget.value } : cost,
											),
										)
									}
								/>
								<Input
									aria-label={`${item.label} a month`}
									inputmode="decimal"
									placeholder="0"
									value={item.monthly}
									onInput={(event) =>
										setCosts(
											costs().map((cost, at) =>
												at === index() ? { ...cost, monthly: event.currentTarget.value } : cost,
											),
										)
									}
								/>
								<IconButton
									label={`Remove ${item.label}`}
									size="sm"
									onClick={() => setCosts(costs().filter((_, at) => at !== index()))}
								>
									<CloseIcon />
								</IconButton>
							</Row>
						)}
					</For>
					<LinkButton
						tone="accent"
						icon={<PlusIcon size="sm" />}
						onClick={() => setCosts([...costs(), { label: "", monthly: "" }])}
					>
						Add a cost
					</LinkButton>
				</Stack>
			</Stack>
		</Dialog>
	);
}
