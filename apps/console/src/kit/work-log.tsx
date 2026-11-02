import type { JSX } from "@solidjs/web";
import { createContext, onSettled, Show, useContext } from "solid-js";

import { ChevronRightIcon, CloseIcon } from "./icons";

/**
 * An agent's work as a quiet log, ported from T3 Code's work log (MIT, © T3 Tools Inc.): one
 * 24px line per thing it did, a muted icon, what it did in secondary ink, and a chevron when there
 * is more to see. A run of calls folds into one summary line ("Read 3 files and ran 2 commands")
 * that opens to the lines; the one under way shines while it runs. Nothing is boxed: the log
 * reads as part of the turn, and the reply stays the loudest thing on screen.
 */

const Grouped = createContext(false);

/** Lines that belong together: tighter, with no gap between them. */
export function WorkLogList(props: { children: JSX.Element }): JSX.Element {
	return (
		<Grouped value={true}>
			<div class="flex min-w-0 flex-col">{props.children}</div>
		</Grouped>
	);
}

/** How a line's icon is inked: muted at rest, ink while live, faded red when its call failed. */
export type WorkLogTone = "muted" | "ink" | "failed" | "danger" | "warning";

const ICON_TONE: Record<WorkLogTone, string> = {
	muted: "text-fg-subtle",
	ink: "text-fg",
	failed: "text-danger/50",
	danger: "text-danger",
	warning: "text-warning",
};

/** A line's leading icon, 16px in a 24px cell, so labels align down the log. */
export function WorkLogIcon(props: {
	tone?: WorkLogTone;
	/** Said for screen readers: "Tool call failed". */
	label?: string;
	children: JSX.Element;
}): JSX.Element {
	return (
		<span
			role={props.label ? "img" : undefined}
			aria-label={props.label}
			aria-hidden={props.label ? undefined : "true"}
			class={`flex size-4 items-center justify-center [&_svg]:size-4 ${ICON_TONE[props.tone ?? "muted"]}`}
		>
			{props.children}
		</span>
	);
}

/** The chevron at a line's end: turned down while open, kept in place (unseen) when nothing opens. */
export function WorkLogChevron(props: { expanded: boolean; hidden?: boolean }): JSX.Element {
	return (
		<span
			aria-hidden="true"
			class={`flex size-4 shrink-0 items-center justify-center ${props.hidden ? "invisible" : ""}`}
		>
			<ChevronRightIcon
				size="xs"
				class={`shrink-0 text-fg-subtle opacity-70 transition-transform duration-base ${props.expanded ? "rotate-90" : ""}`}
			/>
		</span>
	);
}

/** The small cross after a failed call's label. */
export function WorkLogFailedMark(): JSX.Element {
	return <CloseIcon size="xs" class="shrink-0 text-danger/50" />;
}

type LineProps = {
	icon?: JSX.Element;
	label: JSX.Element;
	trailing?: JSX.Element;
	/** Let the label wrap (an error's message) instead of cutting it to one line. */
	wrapLabel?: boolean;
};

function Line(props: LineProps & { interactive: boolean }): JSX.Element {
	return (
		<div
			class={`flex min-h-6 min-w-0 gap-1.5 text-body leading-relaxed select-none pointer-coarse:min-h-10 ${props.wrapLabel ? "items-start" : "items-center"}`}
		>
			<div class="flex min-w-0 flex-1 items-center gap-1.5">
				<Show when={props.icon}>
					<span class="flex size-6 shrink-0 items-center justify-center">{props.icon}</span>
				</Show>
				<div
					class={`min-w-0 flex-1 text-fg-subtle transition-colors duration-fast ${props.interactive ? "group-hover/work-row:text-fg-muted" : ""} ${props.wrapLabel ? "" : "truncate [&_*]:whitespace-nowrap"}`}
				>
					{props.label}
				</div>
			</div>
			{props.trailing}
		</div>
	);
}

/**
 * One line of the log. Given `onToggle` it opens and closes (click, Enter or Space) and its
 * children are what it opens to; it is a div, not a button, so what it shows can be selected and
 * hold controls of its own.
 */
export function WorkLogRow(
	props: LineProps & {
		expanded?: boolean;
		onToggle?: () => void;
		/** The line's name for screen readers, when its label alone does not say it. */
		ariaLabel?: string;
		children?: JSX.Element;
	},
): JSX.Element {
	const grouped = useContext(Grouped);
	return (
		// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role, jsx-a11y/no-static-element-interactions -- a div so the opened detail stays selectable and can hold buttons; it takes role="button" whenever it toggles
		<div
			role={props.onToggle ? "button" : undefined}
			tabindex={props.onToggle ? 0 : undefined}
			aria-expanded={props.onToggle ? (props.expanded ? "true" : "false") : undefined}
			aria-label={props.ariaLabel}
			onClick={() => props.onToggle?.()}
			onKeyDown={(event) => {
				if (!props.onToggle || event.target !== event.currentTarget) return;
				if (event.key !== "Enter" && event.key !== " ") return;
				event.preventDefault();
				props.onToggle();
			}}
			class={`group/work-row relative w-full min-w-0 rounded-kit px-0.5 text-left transition-colors duration-fast ${grouped ? "py-0" : "py-0.5"} ${props.onToggle ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-inset" : ""}`}
		>
			<Line
				interactive={Boolean(props.onToggle)}
				icon={props.icon}
				label={props.label}
				trailing={props.trailing}
				wrapLabel={props.wrapLabel}
			/>
			{props.children}
		</div>
	);
}

/**
 * What a line opens to. `text` is prose (a thought), indented under the label and scrolling past
 * 24rem; `panel` holds a call's input, output or diff; `media` an image. With `followLive` it
 * stays scrolled to the newest words while they stream in, until scrolled up.
 */
export function WorkLogDetails(props: {
	kind?: "text" | "panel" | "media";
	followLive?: boolean;
	children: JSX.Element;
}): JSX.Element {
	let scroller: HTMLDivElement | undefined;
	let atEdge = true;
	onSettled(() => {
		const el = scroller;
		if (!el || !props.followLive) return;
		const follow = new MutationObserver(() => {
			if (atEdge) el.scrollTop = el.scrollHeight;
		});
		follow.observe(el, { childList: true, subtree: true, characterData: true });
		el.scrollTop = el.scrollHeight;
		return () => follow.disconnect();
	});
	const kind = () => props.kind ?? "text";
	return (
		// oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- keeps a click inside the detail from closing its line
		<div
			ref={(el) => {
				scroller = el;
			}}
			onScroll={(event) => {
				const el = event.currentTarget;
				atEdge = el.scrollHeight - el.scrollTop - el.clientHeight <= 4;
			}}
			onClick={(event) => event.stopPropagation()}
			onPointerDown={(event) => event.stopPropagation()}
			class={`cursor-auto ${
				kind() === "text"
					? "ms-7 flex max-h-96 flex-col gap-3 overflow-auto px-0.5 py-1 select-text"
					: kind() === "panel"
						? "ms-7 mt-0.5 mb-1.5 flex flex-col gap-1.5 select-text"
						: "ms-7 mt-1"
			}`}
		>
			{props.children}
		</div>
	);
}

/** A call's input or output in the open panel: mono, wrapped, scrolling past 16rem. */
export function WorkLogOutput(props: { children: JSX.Element }): JSX.Element {
	return (
		<pre class="max-h-64 cursor-text overflow-auto whitespace-pre-wrap break-words rounded-kit bg-fill px-2.5 py-2 font-mono text-caption text-fg-subtle leading-relaxed select-text">
			{props.children}
		</pre>
	);
}

/**
 * The summary of a run of calls, as a line that opens to them: its icon is the kind of work
 * (a terminal for commands, an eye for reads), and a cross follows when a call failed.
 */
export function WorkGroupHeader(props: {
	icon: JSX.Element;
	label: string;
	expanded: boolean;
	failed?: boolean;
	onToggle: () => void;
}): JSX.Element {
	return (
		<WorkLogRow
			expanded={props.expanded}
			onToggle={props.onToggle}
			ariaLabel={props.failed ? `${props.label}, a tool call failed` : props.label}
			icon={<WorkLogIcon>{props.icon}</WorkLogIcon>}
			label={<span class="block truncate">{props.label}</span>}
			trailing={
				<>
					<Show when={props.failed}>
						<WorkLogFailedMark />
					</Show>
					<WorkLogChevron expanded={props.expanded} />
				</>
			}
		/>
	);
}

/**
 * What the agent is doing now, as a line whose words shine while it works ("Reading
 * src/app.ts"). Clicking it opens the run it belongs to. Still under reduced motion.
 */
export function LiveActivityRow(props: {
	icon: JSX.Element;
	label: JSX.Element;
	failed?: boolean;
	onToggle?: () => void;
	expanded?: boolean;
}): JSX.Element {
	return (
		<WorkLogRow
			expanded={props.expanded}
			onToggle={props.onToggle}
			icon={<WorkLogIcon tone={props.failed ? "failed" : "muted"}>{props.icon}</WorkLogIcon>}
			label={
				<span class={`block truncate ${props.failed ? "" : "kit-live-shine"}`}>{props.label}</span>
			}
			trailing={
				<Show when={props.failed}>
					<WorkLogFailedMark />
				</Show>
			}
		/>
	);
}
