import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";

import { ChevronDownIcon, CloseIcon, GlobeIcon, TerminalIcon } from "./icons";
import { variants } from "./variants";

/** A terminal's frame: dark whatever the theme, monospaced, the way a real one looks. */
export function Terminal(props: { children: JSX.Element; class?: string }): JSX.Element {
	return (
		<div
			class={`flex min-h-0 flex-col bg-terminal p-4 font-mono text-caption text-terminal-fg leading-6 ${props.class ?? ""}`}
		>
			{props.children}
		</div>
	);
}

const TONE = {
	default: "",
	dim: "text-terminal-dim",
	green: "text-terminal-green",
	blue: "text-terminal-blue",
} as const;

/** A run of terminal text in one of its colours. */
export function TermText(props: { tone?: keyof typeof TONE; children: JSX.Element }): JSX.Element {
	return <span class={TONE[props.tone ?? "default"]}>{props.children}</span>;
}

/**
 * Actions for text selected in a terminal (copy, paste, select all), floating just above the
 * selection at `x`, `y` in the terminal's own coordinates.
 */
export function SelectionBar(props: {
	x: number;
	y: number;
	actions: readonly { label: string; icon?: JSX.Element; run: () => void }[];
}): JSX.Element {
	return (
		<div
			role="toolbar"
			aria-label="Selection actions"
			style={{ left: `${props.x}px`, top: `${props.y}px` }}
			class="pointer-events-auto absolute z-30 flex items-center gap-0.5 rounded-kit-md bg-surface-raised p-0.5 shadow-float"
		>
			<For each={props.actions}>
				{(action) => (
					<button
						type="button"
						onClick={() => action.run()}
						class="focus-ring flex h-8 items-center gap-1 rounded-kit-sm px-2 text-caption text-fg hover:bg-fill active:bg-fill-strong"
					>
						{action.icon}
						<span>{action.label}</span>
					</button>
				)}
			</For>
		</div>
	);
}

/**
 * A drag handle at one end of a touch selection: a small dot inside a finger-sized target,
 * above the text for the start, below it for the end.
 */
export function SelectionHandle(props: {
	edge: "start" | "end";
	x: number;
	y: number;
	onPointerDown: (event: PointerEvent) => void;
}): JSX.Element {
	return (
		<div
			aria-label={props.edge === "start" ? "Selection start handle" : "Selection end handle"}
			style={{ left: `${props.x}px`, top: `${props.y}px` }}
			onPointerDown={(event) => props.onPointerDown(event)}
			class={`pointer-events-auto absolute z-30 -translate-x-1/2 touch-none select-none ${props.edge === "start" ? "-translate-y-full" : ""}`}
		>
			<div class="grid size-11 place-items-center">
				<div class="size-3 rounded-full bg-accent shadow-lift ring-2 ring-surface" />
			</div>
		</div>
	);
}

/** Back to the newest output, floating over a terminal scrolled up while more arrives. */
export function JumpToLatest(props: { onClick: () => void }): JSX.Element {
	return (
		<button
			type="button"
			aria-label="Jump to latest output"
			onClick={() => props.onClick()}
			class="focus-ring absolute right-6 bottom-4 z-20 flex items-center gap-1.5 rounded-full bg-inverse px-3 py-1.5 font-kit text-caption text-inverse-fg shadow-float transition-transform duration-fast ease-out-grid active:scale-95"
		>
			<ChevronDownIcon size="xs" />
			<span>Latest output</span>
		</button>
	);
}

/**
 * A touch scrollbar: a wide, invisible grab strip at the right edge with a thin thumb inside it,
 * like a native one. The caller moves the thumb (its `track` and `thumb` refs); `data-dragging`
 * on the thumb widens it.
 */
export function TouchScrollbar(props: {
	track: (el: HTMLDivElement) => void;
	thumb: (el: HTMLDivElement) => void;
}): JSX.Element {
	return (
		<div
			ref={(el) => props.track(el)}
			aria-hidden="true"
			data-no-swipe
			class="absolute inset-y-1 right-0 z-10 hidden w-5 touch-none pointer-coarse:block"
		>
			<div
				ref={(el) => props.thumb(el)}
				class="absolute right-1 hidden w-1 rounded-full bg-fg-faint transition-[width,background-color] duration-fast ease-out-grid data-[dragging]:w-1.5 data-[dragging]:bg-fg-subtle"
			/>
		</div>
	);
}

/**
 * A key on the terminal's touch key bar: finger-sized, monospaced, lit while pressed and, for
 * a modifier, while armed (`aria-pressed`). `page` is the quieter key that flips the bar's page.
 */
export const terminalKey = variants({
	base: "grid min-h-11 min-w-11 shrink-0 select-none place-items-center rounded-kit-md px-2.5 font-mono text-body text-fg-muted transition-colors duration-fast ease-out-grid active:bg-fill-strong aria-pressed:bg-inverse aria-pressed:text-inverse-fg",
	variants: {
		kind: {
			key: "",
			page: "bg-fill font-kit font-medium text-caption",
			record: "aria-pressed:bg-danger aria-pressed:text-white",
		},
	},
	defaults: { kind: "key" },
});

/** The touch key bar: a row that scrolls sideways above the phone keyboard; touch screens only. */
export function KeyStrip(props: {
	label: string;
	children: JSX.Element;
	onTouchStart?: (event: TouchEvent) => void;
	onTouchEnd?: (event: TouchEvent) => void;
}): JSX.Element {
	return (
		<div
			role="toolbar"
			aria-label={props.label}
			onTouchStart={(event) => props.onTouchStart?.(event)}
			onTouchEnd={(event) => props.onTouchEnd?.(event)}
			class="hidden shrink-0 items-center gap-1 overflow-x-auto border-line border-t bg-surface px-1 py-1 [scrollbar-width:none] pointer-coarse:flex"
		>
			{props.children}
		</div>
	);
}

/** Which of a few pages is showing, as dots. */
export function PageDots(props: { count: number; current: number }): JSX.Element {
	return (
		<span class="flex gap-0.5" aria-hidden="true">
			<For each={Array.from({ length: props.count }, (_, index) => index)}>
				{(index) => (
					<span
						class={`size-1 rounded-full ${index === props.current ? "bg-current" : "bg-current opacity-30"}`}
					/>
				)}
			</For>
		</span>
	);
}

/* ------------------------------------------------------------------------------------------
 * Figma 15 · Terminals. Shells on a machine: listed in the panel with what each is doing, as tabs
 * along the top of the dark terminal with where it is, and on phones as cards of their last lines.
 * ---------------------------------------------------------------------------------------- */

/** How a terminal is doing, as its dot: running something, serving, ended badly, or idle. */
export type TerminalState = "running" | "serving" | "failed" | "idle";

const STATE_DOT: Record<TerminalState, string> = {
	running: "bg-warning",
	serving: "bg-success",
	failed: "bg-danger",
	idle: "bg-fg-faint",
};

const STATE_TEXT: Record<TerminalState, string> = {
	running: "text-warning",
	serving: "text-fg-subtle",
	failed: "text-danger",
	idle: "text-fg-subtle",
};

/** A caption over a group of terminals: the machine, Recent. */
export function TerminalGroupLabel(props: { children: JSX.Element }): JSX.Element {
	return <h3 class="px-2 pt-2 pb-1 font-medium text-caption text-fg-subtle">{props.children}</h3>;
}

/**
 * A terminal in the panel (Figma Terminals panel row): a shell, or a globe while it serves a port;
 * its name; what it is doing ("localhost:5173", "bun test --watch", "exit 0 · 1d ago"); its dot.
 */
export function TerminalPanelRow(props: {
	href: string;
	title: string;
	detail: string;
	state: TerminalState;
	/** Ended: listed under Recent, quieter and without a dot. */
	ended?: boolean;
	current?: boolean;
}): JSX.Element {
	return (
		<a
			href={props.href}
			aria-current={props.current ? "page" : undefined}
			class="focus-ring flex min-w-0 items-start gap-2 rounded-kit-md p-2 transition-colors duration-fast hover:bg-fill aria-[current=page]:bg-fill-strong"
		>
			<span
				class={`grid size-4 shrink-0 place-items-center pt-0.5 [&_svg]:size-4 ${props.state === "serving" ? "text-success" : "text-fg-subtle"} ${props.ended ? "opacity-60" : ""}`}
			>
				{props.state === "serving" ? <GlobeIcon /> : <TerminalIcon />}
			</span>
			<span class="flex min-w-0 flex-1 flex-col gap-0.5">
				<span class={`truncate text-body ${props.ended ? "text-fg-muted" : "font-medium text-fg"}`}>
					{props.title}
				</span>
				<span
					class={`truncate text-caption ${props.ended ? "text-fg-subtle" : STATE_TEXT[props.state]}`}
				>
					{props.detail}
				</span>
			</span>
			<Show when={!props.ended}>
				<span
					aria-hidden="true"
					class={`mt-1.5 size-1.5 shrink-0 rounded-full ${STATE_DOT[props.state]}`}
				/>
			</Show>
		</a>
	);
}

/**
 * Where the live terminal sits (Figma Terminal · Simple): edge to edge under the top bar on
 * desktop, a dark card inset from the screen's edges on phones.
 */
export function TerminalFrame(props: { hidden?: boolean; children: JSX.Element }): JSX.Element {
	return (
		<div
			class={`min-h-0 flex-1 flex-col overflow-hidden bg-terminal max-md:mx-3 max-md:mb-2 max-md:rounded-kit-xl ${props.hidden ? "hidden" : "flex"}`}
		>
			{props.children}
		</div>
	);
}

/** One tab along the top of the terminal. */
export type TerminalTab = { id: string; label: string; href: string; state: TerminalState };

/**
 * The terminal's own top strip (Figma Terminal tabs): each shell as a dot and its name, the one
 * showing bright; on the right where it is (machine, folder, branch). Dark like the terminal.
 */
export function TerminalTabs(props: {
	tabs: readonly TerminalTab[];
	current: string | null;
	onClose?: (id: string) => void;
	/** On the right: the machine, the folder and the branch. */
	where?: JSX.Element;
}): JSX.Element {
	return (
		<div class="flex h-9 shrink-0 items-center gap-3 border-terminal-dim/20 border-b bg-terminal px-3 font-mono text-caption">
			<div class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
				<For each={props.tabs} keyed={(tab) => tab.id}>
					{(tab) => {
						return (
							<div
								aria-current={props.current === tab().id ? "page" : undefined}
								class="group/tab flex shrink-0 items-center rounded-kit-sm text-terminal-dim transition-colors duration-fast hover:text-terminal-fg aria-[current=page]:text-terminal-fg"
							>
								<a
									href={tab().href}
									class="focus-ring flex items-center gap-1.5 rounded-kit-sm py-1 pl-1.5"
								>
									<span
										aria-hidden="true"
										class={`size-1.5 shrink-0 rounded-full ${STATE_DOT[tab().state]}`}
									/>
									<span class="max-w-40 truncate">{tab().label}</span>
								</a>
								<Show when={props.onClose} fallback={<span class="w-1.5" />}>
									{(close) => (
										<button
											type="button"
											aria-label={`Close ${tab().label}`}
											onClick={() => close()(tab().id)}
											class="focus-ring ml-0.5 grid size-5 place-items-center rounded-kit-sm opacity-0 transition-opacity duration-fast hover:bg-terminal-dim/20 focus-visible:opacity-100 group-hover/tab:opacity-100 pointer-coarse:opacity-100 [&_svg]:size-3"
										>
											<CloseIcon />
										</button>
									)}
								</Show>
							</div>
						);
					}}
				</For>
			</div>
			<Show when={props.where}>
				<div class="hidden min-w-0 shrink items-center gap-3 truncate text-terminal-dim md:flex">
					{props.where}
				</div>
			</Show>
		</div>
	);
}

/** The branch a terminal is on, in the terminal's own accent, with how far ahead it is. */
export function TerminalBranch(props: { name: string; ahead?: number | null }): JSX.Element {
	return (
		<span class="flex min-w-0 items-center gap-1">
			<span class="truncate text-violet">{props.name}</span>
			<Show when={props.ahead}>
				<span class="text-terminal-dim">↑{props.ahead}</span>
			</Show>
		</span>
	);
}

/** Under a phone's terminal (Figma Status line): its dot and branch on the left, what it does on the right. */
export function TerminalStatusLine(props: {
	state: TerminalState;
	start?: JSX.Element;
	end?: JSX.Element;
}): JSX.Element {
	return (
		<div class="flex h-9 shrink-0 items-center gap-2 border-terminal-dim/20 border-t bg-terminal px-3 font-mono text-caption text-terminal-dim">
			<span aria-hidden="true" class={`size-1.5 shrink-0 rounded-full ${STATE_DOT[props.state]}`} />
			<span class="flex min-w-0 flex-1 items-center gap-2">{props.start}</span>
			<span class="min-w-0 truncate">{props.end}</span>
		</div>
	);
}

/**
 * A terminal on the phone's list (Figma Terminal · Sessions): its dot, name and what it is doing,
 * then its last lines, all in the terminal's dark.
 */
export function TerminalSessionCard(props: {
	href: string;
	title: string;
	detail?: string;
	state: TerminalState;
	lines: readonly string[];
}): JSX.Element {
	return (
		<a
			href={props.href}
			aria-label={props.detail ? `${props.title}, ${props.detail}` : props.title}
			class="focus-ring block overflow-hidden rounded-kit-xl bg-terminal font-mono text-caption"
		>
			<span class="flex items-center gap-2 border-terminal-dim/20 border-b px-3 py-2.5">
				<span
					aria-hidden="true"
					class={`size-1.5 shrink-0 rounded-full ${STATE_DOT[props.state]}`}
				/>
				<span class="font-medium text-terminal-fg">{props.title}</span>
				<Show when={props.detail}>
					<span
						class={`min-w-0 truncate ${props.state === "serving" ? "text-terminal-blue" : props.state === "failed" ? "text-danger" : props.state === "running" ? "text-warning" : "text-terminal-dim"}`}
					>
						{props.detail}
					</span>
				</Show>
			</span>
			<span class="flex flex-col px-3 py-2.5 text-terminal-fg leading-5">
				<Show
					when={props.lines.length}
					fallback={<span class="text-terminal-dim">Nothing printed yet</span>}
				>
					<For each={props.lines}>
						{(line) => <span class="truncate whitespace-pre">{line}</span>}
					</For>
				</Show>
			</span>
		</a>
	);
}
