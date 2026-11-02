import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

/**
 * What waits on the composer, attached to it, after T3 Code's composer banners (MIT, © T3 Tools
 * Inc.): a strip inset a little from the composer's sides whose bottom tucks under the card, so
 * the goal, a limit wait, the subagents at work, the queue and the questions an agent asks read
 * as part of the composer rather than cards floating over the thread. Rows stack in one strip,
 * divided by hairlines; it draws nothing when it has no rows.
 */
export function ComposerBanners(props: {
	/** A strip of its own, whole and apart from any composer (a preview, a notice). */
	detached?: boolean;
	children: JSX.Element;
}): JSX.Element {
	return (
		<div
			data-composer-banners={props.detached ? "detached" : "attached"}
			class={`relative z-0 flex flex-col overflow-hidden border border-line-strong bg-surface-raised shadow-float [&:not(:has(*))]:hidden ${props.detached ? "rounded-kit-2xl" : "mx-[1.375rem] -mb-4 rounded-t-kit-2xl border-b-0 pb-4"}`}
		>
			{props.children}
		</div>
	);
}

/** How a row is tinted: plain, or a warning (a limit) or danger (a failure) wash. */
export type ComposerBannerTone = "default" | "warning" | "danger";

const TONE: Record<ComposerBannerTone, string> = {
	default: "",
	warning: "bg-warning/8",
	danger: "bg-danger/8",
};

/**
 * One row of the strip: an icon, what it says (one line, in caption text) and its actions at the
 * end. `drawer` gives it room for a whole question or approval instead of a line.
 */
export function ComposerBannerRow(props: {
	icon?: JSX.Element;
	tone?: ComposerBannerTone;
	actions?: JSX.Element;
	drawer?: boolean;
	label?: string;
	children: JSX.Element;
}): JSX.Element {
	return (
		<section
			aria-label={props.label}
			class={`flex min-w-0 border-line border-t first:border-t-0 ${TONE[props.tone ?? "default"]} ${props.drawer ? "flex-col gap-2 px-3 pt-3 pb-2" : "min-h-9 items-center gap-2 py-1 ps-3 pe-1.5 text-caption text-fg-muted pointer-coarse:min-h-11"}`}
		>
			<Show when={props.icon}>
				<span class="flex size-4 shrink-0 items-center justify-center text-fg-subtle [&_svg]:size-3.5">
					{props.icon}
				</span>
			</Show>
			<div class="min-w-0 flex-1">{props.children}</div>
			<Show when={props.actions}>
				<div class="flex shrink-0 items-center gap-1">{props.actions}</div>
			</Show>
		</section>
	);
}
