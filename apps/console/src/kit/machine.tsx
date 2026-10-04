import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";

/* ------------------------------------------------------------------------------------------
 * Figma 24 · Settings → Machines. This machine as a card: what it is and whether it answers, how
 * hard it is working (CPU, memory, disk as meters), and what runs on it.
 * ---------------------------------------------------------------------------------------- */

/** A measure on the card, with its bar in a signal's colour. */
export type MachineStat = {
	label: string;
	value: string;
	/** How full, 0–100. */
	percent: number;
	tone: "accent" | "violet" | "success";
};

const BAR: Record<MachineStat["tone"], string> = {
	accent: "bg-accent",
	violet: "bg-violet",
	success: "bg-success",
};

/** This machine: its glyph, name and status, a line about it, its meters and what runs on it. */
export function MachineCard(props: {
	icon: JSX.Element;
	name: string;
	status: JSX.Element;
	meta: string;
	stats: readonly MachineStat[];
	footer?: JSX.Element;
	action?: JSX.Element;
	menu?: JSX.Element;
}): JSX.Element {
	return (
		<section
			aria-label={props.name}
			class="flex min-w-0 flex-col overflow-hidden rounded-kit-lg bg-surface ring-line"
		>
			<div class="flex min-w-0 items-center gap-3 p-4">
				<span class="grid size-10 shrink-0 place-items-center rounded-kit-lg tint-success [&_svg]:size-5">
					{props.icon}
				</span>
				<div class="min-w-0 flex-1">
					<p class="flex min-w-0 items-center gap-2">
						<span class="truncate text-body-lg text-fg">{props.name}</span>
						{props.status}
					</p>
					<p class="truncate text-caption text-fg-subtle">{props.meta}</p>
				</div>
				{props.menu}
			</div>
			<div class="grid gap-4 border-line border-t px-4 py-3.5 md:grid-cols-3 md:gap-5">
				<For each={props.stats}>
					{(stat) => (
						<div class="flex min-w-0 flex-col gap-1.5">
							<span class="flex items-center justify-between gap-2 text-caption">
								<span class="text-fg-subtle">{stat.label}</span>
								<span class="text-fg tabular-nums">{stat.value}</span>
							</span>
							<span class="h-1 overflow-hidden rounded-full bg-fill-strong">
								<span
									class={`block h-full rounded-full ${BAR[stat.tone]}`}
									style={{ width: `${Math.min(100, Math.max(0, stat.percent))}%` }}
								/>
							</span>
						</div>
					)}
				</For>
			</div>
			<Show when={props.footer || props.action}>
				<div class="flex min-w-0 items-center justify-between gap-3 bg-fill px-4 py-2.5 text-caption text-fg-muted [&_img]:size-3.5 [&_svg]:size-3.5">
					<span class="flex min-w-0 items-center gap-1.5 truncate">{props.footer}</span>
					<span class="shrink-0 max-md:hidden">{props.action}</span>
				</div>
			</Show>
		</section>
	);
}
