import ArrowShrink01Icon from "@hugeicons/core-free-icons/ArrowShrink01Icon";
import Layers01Icon from "@hugeicons/core-free-icons/Layers01Icon";
import LockIcon from "@hugeicons/core-free-icons/LockIcon";
import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";

import { Button } from "./button";
import { Icon } from "./icons";
import { JOINED_BUTTON } from "./joined";
import { Popover } from "./popover";
import { DOCK_CHIP } from "./prompt-box";

/** Tokens as people say them: 76k, 1.2M. */
export function formatTokens(count: number): string {
	if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(count >= 10_000_000 ? 0 : 1)}M`;
	if (count >= 1000) return `${Math.round(count / 1000)}k`;
	return String(count);
}

/** One window of a plan's limits, as the agent last reported it. */
export type ContextLimit = {
	/** "5h", "Weekly", "Weekly · Opus". */
	window: string;
	/** 0–100, or null when only "allowed" is known. */
	used: number | null;
	/** Used up for now. */
	limited: boolean;
	/** When it resets, in words: "resets in 2h 10m · Sat 14:00". */
	resets?: string;
};

/** A part of what fills the context, for its split: the agent's setup, the conversation… */
export type ContextPart = {
	id: string;
	label: string;
	/** A few words beside it: "38 messages", "21 calls". */
	detail?: string;
	tokens: number;
	tone: "neutral" | "accent" | "violet";
	/** Always there: compacting does not touch it. */
	fixed?: boolean;
};

const PART_COLOUR: Record<ContextPart["tone"], string> = {
	neutral: "var(--kit-fg-faint)",
	accent: "var(--signal-accent)",
	violet: "var(--signal-violet)",
};

/** The colour of a share used: accent, amber from 80%, red from 95% (or when used up). */
function tone(share: number, limited = false): string {
	if (limited || share >= 0.95) return "var(--signal-danger)";
	if (share >= 0.8) return "var(--signal-warning)";
	return "var(--signal-accent)";
}

/** A thin bar, filled to `share` in the share's colour; a meter for screen readers. */
function Bar(props: { share: number; limited?: boolean; label: string }): JSX.Element {
	return (
		<>
			<meter
				class="sr-only"
				aria-label={props.label}
				min={0}
				max={1}
				value={Math.min(1, Math.max(0, props.share))}
			/>
			<span aria-hidden="true" class="block h-1.5 overflow-hidden rounded-full bg-fill-strong">
				<span
					class="block h-full rounded-full transition-[width] duration-slow ease-out-grid"
					style={{
						width: `${Math.min(100, Math.max(0, props.share * 100))}%`,
						background: tone(props.share, props.limited),
					}}
				/>
			</span>
		</>
	);
}

/** The context's split as one bar: a pill per part, in its colour, then the room left. */
function SplitBar(props: { parts: readonly ContextPart[]; total: number }): JSX.Element {
	const share = (tokens: number) => `${(tokens / Math.max(1, props.total)) * 100}%`;
	return (
		<span aria-hidden="true" class="flex h-2 w-full gap-1">
			<For each={props.parts.filter((part) => part.tokens > 0)}>
				{(part) => (
					<span
						class="block h-full min-w-1.5 shrink-0 rounded-full transition-[width] duration-slow ease-out-grid"
						style={{
							width: `calc(${share(part.tokens)} - 0.25rem)`,
							background: PART_COLOUR[part.tone],
						}}
					/>
				)}
			</For>
			<span class="block h-full min-w-0 flex-1 rounded-full bg-fill-strong" />
		</span>
	);
}

/** "62% left", "Used up", "Available": a plan window in words. */
function left(limit: ContextLimit): string {
	if (limit.limited) return "Used up";
	if (limit.used === null) return "Available";
	return `${Math.max(0, 100 - Math.round(limit.used))}% left`;
}

/**
 * The composer's context and usage, on its shelf: a small ring (how full the agent's context
 * is) and its percent, opening a panel with everything about room to work — the selected model's
 * context window and how much of it the thread uses, a button to compact it, the plan's limits (5-hour, weekly…) with when
 * each resets, and what this thread has used. The ring is accent until it fills, amber from 80%
 * and red from 95%, and red when a plan limit is used up. What is not known yet says so.
 */
export function ContextMeter(props: {
	/** Tokens the conversation takes now, once the agent has reported it. */
	used?: number;
	/** The model's context window in tokens, from the agent or its catalog. */
	total?: number;
	/** The selected model's name. */
	model?: string;
	/** What fills the context, estimated; drawn as its split. */
	parts?: readonly ContextPart[];
	limits?: readonly ContextLimit[];
	/** The agent's own count, or the thread's text sized when it reports none: shown with "≈". */
	estimated?: boolean;
	/** The agent the thread runs on, and its mark, for its account row. */
	agentName?: string;
	agentMark?: JSX.Element;
	/** Who it runs as: the email or plan it is signed in with, or an added account's name. */
	account?: string;
	/** When Grid carries the thread on after a limit resets, in words. */
	carryOn?: string | null;
	/** This thread's tokens and cost so far. */
	thread?: { input?: number; output?: number; cost?: number };
	/** Compact the context now; left out where the agent cannot. */
	onCompact?: () => void;
	/** Why compacting cannot happen right now (the agent is working), shown instead. */
	compactBlocked?: string | null;
	/** A segment of a joined pill (the phone header): the ring alone, larger, opening downwards. */
	joined?: boolean;
}): JSX.Element {
	const ratio = () =>
		props.used !== undefined && props.total
			? Math.min(1, Math.max(0, props.used / Math.max(1, props.total)))
			: 0;
	const percent = () => Math.round(ratio() * 100);
	const limited = () => (props.limits ?? []).some((limit) => limit.limited);
	const approx = () => (props.estimated ? "≈" : "");
	const hasUsed = () => (props.used ?? 0) > 0;
	const known = () => hasUsed() && Boolean(props.total);
	/** How full, in a few characters: "≈12%", "≈13k" without a window, "–" before anything. */
	const amount = () =>
		known()
			? `${approx()}${percent()}%`
			: hasUsed()
				? `${approx()}${formatTokens(props.used ?? 0)}`
				: null;
	const label = () =>
		known()
			? `Context ${approx()}${percent()}% · ${formatTokens(props.used ?? 0)} of ${formatTokens(props.total ?? 0)} tokens`
			: hasUsed()
				? `Context ${approx()}${formatTokens(props.used ?? 0)} tokens used`
				: props.total
					? `Context window ${formatTokens(props.total)} tokens`
					: "Context and usage";
	const radius = 6;
	const around = 2 * Math.PI * radius;
	return (
		<Popover
			label={label()}
			title="Context and usage"
			placement={props.joined ? "bottom-end" : "top-end"}
			width="md:w-96"
			triggerClass={props.joined ? JOINED_BUTTON : `${DOCK_CHIP} tabular-nums`}
			trigger={
				<>
					<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" class="-rotate-90">
						<circle
							cx="8"
							cy="8"
							r={radius}
							fill="none"
							stroke={props.joined ? "var(--kit-fg-subtle)" : "var(--kit-fill-strong)"}
							stroke-width={props.joined ? "1.5" : "2"}
						/>
						<circle
							cx="8"
							cy="8"
							r={radius}
							fill="none"
							stroke={tone(ratio(), limited())}
							stroke-width={props.joined ? "1.5" : "2"}
							stroke-linecap="round"
							stroke-dasharray={String(around)}
							stroke-dashoffset={String(around * (1 - (limited() ? 1 : ratio())))}
							class="transition-[stroke-dashoffset] duration-slow ease-out-grid"
						/>
					</svg>
					<Show when={!props.joined}>
						<span aria-hidden="true">
							{amount() ?? (props.total ? formatTokens(props.total) : "Context")}
						</span>
					</Show>
				</>
			}
		>
			{(close) => (
				<div class="flex flex-col gap-3 p-1.5">
					<div class="overflow-hidden rounded-kit-xl bg-fill">
						<header class="flex items-center gap-3 px-3.5 py-3">
							<span class="grid size-8 shrink-0 place-items-center rounded-control bg-surface text-fg-muted">
								<Icon icon={Layers01Icon} size="sm" />
							</span>
							<div class="flex min-w-0 flex-1 flex-col">
								<span class="text-body text-fg">Context window</span>
								<span class="truncate text-caption text-fg-subtle">
									{props.model ?? "This thread"}
								</span>
							</div>
							<span class="shrink-0 text-title text-fg tabular-nums">{amount() ?? "–"}</span>
						</header>
						<div class="flex flex-col rounded-kit-xl bg-surface ring-line">
							<Show
								when={props.total || hasUsed()}
								fallback={
									<p class="px-3.5 py-3 text-body text-fg-muted">
										Nothing in the context yet: it fills from the first message.
									</p>
								}
							>
								<div class="flex flex-col gap-2.5 px-3.5 pt-3 pb-3.5">
									<div class="flex items-baseline justify-between gap-3">
										<span class="text-body text-fg-subtle">
											<span class="font-mono text-body-lg text-fg tabular-nums">
												{approx()}
												{formatTokens(props.used ?? 0)}
											</span>{" "}
											{props.total ? `of ${formatTokens(props.total)} tokens` : "tokens used"}
										</span>
										<span class="shrink-0 font-mono text-caption text-fg-muted tabular-nums">
											{props.total
												? `${formatTokens(Math.max(0, props.total - (props.used ?? 0)))} left`
												: "Window not reported"}
										</span>
									</div>
									<meter
										class="sr-only"
										aria-label="Context used"
										min={0}
										max={1}
										value={ratio()}
									/>
									<Show
										when={props.parts?.length}
										fallback={
											<span aria-hidden="true" class="flex h-2 w-full gap-1">
												<span class="block h-full min-w-0 flex-1 rounded-full bg-fill-strong" />
											</span>
										}
									>
										<SplitBar parts={props.parts ?? []} total={props.total || props.used || 1} />
									</Show>
								</div>
							</Show>
							<Show when={props.parts?.length}>
								<ul class="flex flex-col border-line border-t px-3.5 py-1.5">
									<For each={props.parts ?? []}>
										{(part) => (
											<li class="flex h-10 items-center gap-2.5 text-body">
												<span
													aria-hidden="true"
													class="size-2 shrink-0 rounded-full"
													style={{ background: PART_COLOUR[part.tone] }}
												/>
												<span class="shrink-0 text-fg">{part.label}</span>
												<Show when={part.detail}>
													<span class="min-w-0 truncate text-caption text-fg-subtle">
														{part.detail}
													</span>
												</Show>
												<span class="ml-auto shrink-0 font-mono text-caption text-fg-muted tabular-nums">
													{formatTokens(part.tokens)}
												</span>
												<span class="flex w-16 shrink-0 items-center justify-end gap-1 text-caption text-fg-subtle">
													<Show when={part.fixed}>
														<Icon icon={LockIcon} size="xs" />
														Fixed
													</Show>
												</span>
											</li>
										)}
									</For>
								</ul>
							</Show>
							<div class="flex items-center gap-3 border-line border-t px-3.5 py-2.5">
								<p class="min-w-0 flex-1 text-caption text-fg-subtle">
									{props.compactBlocked ??
										(props.estimated && hasUsed()
											? `Estimated from the thread: ${props.agentName ?? "the agent"} does not report its context.`
											: props.parts?.length
												? "Split estimated from the thread; the agent reports the total."
												: props.onCompact
													? "Compact summarises the conversation to make room."
													: "This agent compacts on its own as it fills.")}
								</p>
								<Show when={props.onCompact}>
									{(compact) => (
										<Button
											size="sm"
											disabled={Boolean(props.compactBlocked)}
											onClick={() => {
												compact()();
												close();
											}}
										>
											<Icon icon={ArrowShrink01Icon} size="xs" />
											Compact now
										</Button>
									)}
								</Show>
							</div>
						</div>
					</div>

					<section class="flex flex-col gap-2.5 px-2">
						<h3 class="text-caption text-fg-subtle">Account and limits</h3>
						<div class="flex items-center gap-2.5">
							<Show when={props.agentMark}>
								<span class="grid size-8 shrink-0 place-items-center rounded-control bg-fill [&_img]:size-4 [&_svg]:size-4">
									{props.agentMark}
								</span>
							</Show>
							<div class="flex min-w-0 flex-col">
								<span class="truncate text-body text-fg">{props.agentName ?? "This agent"}</span>
								<span class="truncate text-caption text-fg-subtle">
									{props.account ?? "Signed in on this machine"}
								</span>
							</div>
						</div>
						<Show
							when={props.limits?.length}
							fallback={
								<p class="text-caption text-fg-muted">
									{props.agentName ?? "This agent"} has not reported plan limits. Codex and Claude
									Code report what is left (5h, weekly) after an answer; other agents do not share
									theirs.
								</p>
							}
						>
							<ul class="flex flex-col gap-3">
								<For each={props.limits ?? []}>
									{(limit) => (
										<li class="flex flex-col gap-1.5">
											<div class="flex items-baseline justify-between gap-3 text-body">
												<span class="text-fg">{limit.window}</span>
												<span
													class={`shrink-0 font-mono text-caption tabular-nums ${limit.limited ? "text-danger" : "text-fg-muted"}`}
												>
													{left(limit)}
												</span>
											</div>
											<Show when={limit.used !== null || limit.limited}>
												<Bar
													share={(limit.limited ? 100 : (limit.used ?? 0)) / 100}
													limited={limit.limited}
													label={`${limit.window} used`}
												/>
											</Show>
											<span class="text-caption text-fg-subtle">
												{limit.resets
													? limit.limited
														? `Back ${limit.resets}`
														: `Resets ${limit.resets}`
													: "No reset time reported"}
											</span>
										</li>
									)}
								</For>
							</ul>
						</Show>
						<Show when={props.carryOn}>
							<p class="rounded-kit bg-fill px-2.5 py-2 text-caption text-fg-muted">
								{props.carryOn}
							</p>
						</Show>
					</section>

					<Show
						when={
							props.thread &&
							(props.thread.input !== undefined ||
								props.thread.output !== undefined ||
								props.thread.cost !== undefined)
						}
					>
						<dl class="mx-2 mb-1 grid grid-cols-3 gap-2 border-line border-t pt-3">
							<For
								each={[
									{ label: "Input", value: props.thread?.input, format: formatTokens },
									{ label: "Output", value: props.thread?.output, format: formatTokens },
									{
										label: "Cost",
										value: props.thread?.cost,
										format: (value: number) =>
											`$${value.toFixed(value > 0 && value < 0.1 ? 3 : 2)}`,
									},
								]}
							>
								{(item) => (
									<div class="flex flex-col gap-0.5">
										<dt class="text-caption text-fg-subtle">{item.label}</dt>
										<dd class="font-mono text-body text-fg tabular-nums">
											{item.value === undefined ? "–" : item.format(item.value)}
										</dd>
									</div>
								)}
							</For>
						</dl>
					</Show>
				</div>
			)}
		</Popover>
	);
}
