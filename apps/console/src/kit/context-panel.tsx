import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";

import { Button, ICON_SIZE } from "./button";
import { Popover } from "./popover";

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

/** The colour of a share used: accent, amber from 80%, red from 95% (or when used up). */
function tone(share: number, limited = false): string {
	if (limited || share >= 0.95) return "var(--signal-danger)";
	if (share >= 0.8) return "var(--signal-warning)";
	return "var(--signal-accent)";
}

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

function Section(props: {
	title: string;
	aside?: JSX.Element;
	children: JSX.Element;
}): JSX.Element {
	return (
		<section class="flex flex-col gap-2.5 px-3 py-3">
			<header class="flex items-baseline justify-between gap-3">
				<h3 class="text-caption text-fg-subtle">{props.title}</h3>
				<Show when={props.aside}>
					<span class="min-w-0 truncate text-caption text-fg-subtle">{props.aside}</span>
				</Show>
			</header>
			{props.children}
		</section>
	);
}

/**
 * The composer's context and usage: a small ring (how full the agent's context is) that opens a
 * panel with everything about room to work — the selected model's context window and how much
 * of it the thread uses, a button to compact it, the plan's limits (5-hour, weekly…) with when
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
	limits?: readonly ContextLimit[];
	/** Which account the limits are for: "Your sign-in", an account's label. */
	account?: string;
	/** When Grid carries the thread on after a limit resets, in words. */
	carryOn?: string | null;
	/** This thread's tokens and cost so far. */
	thread?: { input?: number; output?: number; cost?: number };
	/** Compact the context now; left out where the agent cannot. */
	onCompact?: () => void;
	/** Why compacting cannot happen right now (the agent is working), shown instead. */
	compactBlocked?: string | null;
}): JSX.Element {
	const ratio = () =>
		props.used !== undefined && props.total
			? Math.min(1, Math.max(0, props.used / Math.max(1, props.total)))
			: 0;
	const percent = () => Math.round(ratio() * 100);
	const limited = () => (props.limits ?? []).some((limit) => limit.limited);
	const known = () => props.used !== undefined && Boolean(props.total);
	const label = () =>
		known()
			? `Context ${percent()}% · ${formatTokens(props.used ?? 0)} of ${formatTokens(props.total ?? 0)} tokens`
			: props.total
				? `Context window ${formatTokens(props.total)} tokens`
				: "Context and usage";
	const radius = 6;
	const around = 2 * Math.PI * radius;
	return (
		<Popover
			label={label()}
			title="Context and usage"
			placement="top-end"
			width="md:w-80"
			triggerClass={`focus-ring flex h-7 shrink-0 items-center gap-1.5 rounded-kit px-1.5 text-caption text-fg-subtle tabular-nums transition-colors duration-fast hover:bg-fill-strong hover:text-fg aria-expanded:bg-fill-strong pointer-coarse:h-10 ${ICON_SIZE.md}`}
			trigger={
				<>
					<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" class="-rotate-90">
						<circle
							cx="8"
							cy="8"
							r={radius}
							fill="none"
							stroke="var(--kit-fill-strong)"
							stroke-width="2"
						/>
						<circle
							cx="8"
							cy="8"
							r={radius}
							fill="none"
							stroke={tone(ratio(), limited())}
							stroke-width="2"
							stroke-linecap="round"
							stroke-dasharray={String(around)}
							stroke-dashoffset={String(around * (1 - (limited() ? 1 : ratio())))}
							class="transition-[stroke-dashoffset] duration-slow ease-out-grid"
						/>
					</svg>
					<Show when={known()}>
						<span aria-hidden="true" class="hidden md:inline">
							{percent()}%
						</span>
					</Show>
				</>
			}
		>
			{(close) => (
				<div class="flex flex-col divide-y divide-line">
					<Section title="Context window" aside={props.model}>
						<Show
							when={props.total}
							fallback={
								<p class="text-body text-fg-muted">
									The agent reports its context size with its first answer.
								</p>
							}
						>
							{(total) => (
								<div class="flex flex-col gap-1.5">
									<div class="flex items-baseline justify-between gap-3">
										<span class="text-body-lg text-fg tabular-nums">
											<Show when={props.used !== undefined} fallback={formatTokens(total())}>
												{formatTokens(props.used ?? 0)}
												<span class="text-fg-subtle"> / {formatTokens(total())}</span>
											</Show>
										</span>
										<span class="text-caption text-fg-subtle tabular-nums">
											{props.used !== undefined ? `${percent()}% used` : "tokens"}
										</span>
									</div>
									<Bar share={ratio()} label="Context used" />
									<p class="text-caption text-fg-subtle">
										{props.used !== undefined
											? `${formatTokens(Math.max(0, total() - (props.used ?? 0)))} tokens left.`
											: "Nothing used yet: the thread starts with the whole window."}
									</p>
								</div>
							)}
						</Show>
						<Show when={props.onCompact}>
							{(compact) => (
								<div class="flex items-center justify-between gap-3">
									<p class="min-w-0 text-caption text-fg-muted">
										{props.compactBlocked ??
											"Summarise the conversation so far, so the agent has room to keep going."}
									</p>
									<Button
										size="sm"
										disabled={Boolean(props.compactBlocked)}
										onClick={() => {
											compact()();
											close();
										}}
									>
										Compact
									</Button>
								</div>
							)}
						</Show>
					</Section>

					<Section title="Plan usage" aside={props.account}>
						<Show
							when={props.limits?.length}
							fallback={
								<p class="text-body text-fg-muted">
									Limits show here once the agent reports them, after its first answer.
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
													class={`shrink-0 tabular-nums ${limit.limited ? "text-danger" : "text-fg-muted"}`}
												>
													{limit.limited
														? "Used up"
														: limit.used === null
															? "Available"
															: `${Math.round(limit.used)}% used`}
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
														? `Available again: ${limit.resets}`
														: `Resets ${limit.resets}`
													: "No reset time reported"}
											</span>
										</li>
									)}
								</For>
							</ul>
						</Show>
						<Show when={props.carryOn}>
							<p class="rounded-kit bg-fill-strong px-2.5 py-2 text-caption text-fg-muted">
								{props.carryOn}
							</p>
						</Show>
					</Section>

					<Show
						when={
							props.thread &&
							(props.thread.input !== undefined ||
								props.thread.output !== undefined ||
								props.thread.cost !== undefined)
						}
					>
						<Section title="This thread">
							<dl class="grid grid-cols-3 gap-2 text-center">
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
										<div class="flex flex-col gap-0.5 rounded-kit bg-fill px-2 py-1.5">
											<dt class="text-caption text-fg-subtle">{item.label}</dt>
											<dd class="text-body text-fg tabular-nums">
												{item.value === undefined ? "–" : item.format(item.value)}
											</dd>
										</div>
									)}
								</For>
							</dl>
						</Section>
					</Show>
				</div>
			)}
		</Popover>
	);
}
