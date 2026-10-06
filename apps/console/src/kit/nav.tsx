import type { JSX } from "@solidjs/web";
import { omit, onSettled, Show } from "solid-js";

import { BrandMark } from "./brand";
import { attachContextMenu, type MenuPoint } from "./context-menu";
import { attachEdgeFade } from "./edge-fade";
import { variants } from "./variants";

const row = variants({
	// The Figma panel row: 13px medium in the muted ink, a flat grey selection (bg/selected).
	base: "focus-ring group/nav flex w-full min-w-0 gap-2 rounded-kit text-left font-medium text-fg-muted transition-[background-color,color] duration-fast ease-out-grid select-none [-webkit-touch-callout:none] hover:bg-fill-strong hover:text-fg aria-[current=page]:bg-selection aria-[current=page]:text-fg",
	variants: {
		// Top-level destinations and projects; threads and a project's pages one step down.
		// Level 0 grows to a finger's height on touch: a project's chevron is a 44px button there,
		// and it would overhang a 30px row.
		level: {
			0: "h-kit-row min-h-kit-row items-center px-2 text-nav pointer-coarse:min-h-11",
			1: "h-[calc(var(--kit-h-row)-0.25rem)] items-center px-2 text-body pointer-coarse:h-11",
			/** A row with a second line under its label: as tall as its two lines. */
			2: "min-h-kit-row items-start px-2 py-2 text-nav",
		},
		tone: {
			default: "",
			accent: "text-link hover:text-link",
			danger: "text-danger hover:text-danger",
		},
	},
	defaults: { level: 0, tone: "default" },
});

type NavItemProps = {
	icon?: JSX.Element;
	label: JSX.Element;
	/** A second line under the label (the Figma Home panel: "3 things need you"). */
	detail?: string;
	/** Right-hand detail at rest: a count, a shortcut, a time, a badge. Hidden while actions show. */
	trailing?: JSX.Element;
	/**
	 * An interactive control at the right of the row (a collapse chevron): invisible at rest on
	 * pointers, where it appears on hover or keyboard focus like the row's other actions, and always
	 * drawn on touch, which has no hover to reveal it.
	 */
	trailingAction?: JSX.Element;
	/**
	 * Row actions (a plus, a ⋯ menu): revealed on hover or keyboard focus, never drawn on touch
	 * screens, where a long press on the row opens the menu instead.
	 */
	actions?: JSX.Element;
	/** Right-click (desktop) and long press (touch) on the row. */
	onMenuAt?: (point: MenuPoint) => void;
	current?: boolean;
	level?: 0 | 1 | 2;
	tone?: "default" | "accent" | "danger";
	/** Layout only. */
	class?: string;
};

const OWN = [
	"icon",
	"label",
	"detail",
	"trailing",
	"trailingAction",
	"actions",
	"onMenuAt",
	"current",
	"level",
	"tone",
	"class",
] as const;

function Content(props: NavItemProps): JSX.Element {
	return (
		<>
			<Show when={props.icon}>
				<span
					class={`${props.detail ? "mt-0.75" : ""} grid size-3.5 shrink-0 place-items-center text-fg-subtle group-hover/nav:text-fg-muted group-aria-[current=page]/nav:text-fg [&_svg]:size-3.5 pointer-coarse:size-4 pointer-coarse:[&_svg]:size-4`}
				>
					{props.icon}
				</span>
			</Show>
			<Show
				when={props.detail}
				fallback={<span class="min-w-0 flex-1 truncate">{props.label}</span>}
			>
				<span class="flex min-w-0 flex-1 flex-col">
					<span class="truncate">{props.label}</span>
					<span class="truncate font-normal text-caption text-fg-subtle">{props.detail}</span>
				</span>
			</Show>
			<Show when={props.trailing}>
				<span
					class={`flex shrink-0 items-center gap-1 ${props.actions ? "group-hover/row:invisible group-focus-within/row:invisible pointer-coarse:visible" : ""}`}
				>
					{props.trailing}
				</span>
			</Show>
		</>
	);
}

/** Wraps a row that has actions or a context menu: positions the actions, wires the gestures. */
function RowFrame(props: { item: NavItemProps; children: JSX.Element }): JSX.Element {
	let frame: HTMLDivElement | undefined;
	onSettled(() => {
		if (!frame || !props.item.onMenuAt) return undefined;
		// Read the handler when the gesture fires, not when the row settled: the row re-renders, and
		// the menu it holds then is a different element from the one a settled-time closure opened.
		return attachContextMenu(frame, (point) => props.item.onMenuAt?.(point));
	});
	return (
		<div
			ref={(el) => {
				frame = el;
			}}
			class={`group/row relative min-w-0 ${props.item.class ?? ""}`}
		>
			{props.children}
			<Show when={props.item.actions || props.item.trailingAction}>
				<div class="absolute inset-y-0 right-1 flex items-center gap-0.5">
					<Show when={props.item.actions}>
						{/* On touch the triggers are hidden, never their container: a menu lives inside it,
						    and a menu in a `display: none` parent cannot open from a long press. The
						    container itself must not take pointer events away either, or the sheet it
						    opens would inherit them and nothing in it could be tapped. */}
						<div class="flex items-center gap-0.5 opacity-0 transition-opacity duration-fast group-hover/row:opacity-100 focus-within:opacity-100 pointer-coarse:[&>button]:hidden">
							{props.item.actions}
						</div>
					</Show>
					<Show when={props.item.trailingAction}>
						<div class="flex items-center opacity-0 transition-opacity duration-fast group-hover/row:opacity-100 group-focus-within/row:opacity-100 pointer-coarse:opacity-100">
							{props.item.trailingAction}
						</div>
					</Show>
				</div>
			</Show>
		</div>
	);
}

/** A sidebar destination that is a link. */
export function NavLink(
	props: NavItemProps & Omit<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, "children">,
): JSX.Element {
	const rest = omit(props, ...OWN);
	return (
		<RowFrame item={props}>
			<a
				{...rest}
				// Always set, so the router's own link marking never overrides the caller's choice.
				aria-current={props.current ? "page" : "false"}
				class={row({
					level: props.detail ? 2 : props.level,
					tone: props.tone,
					class: props.actions
						? props.trailingAction
							? "group-hover/row:pr-20 group-focus-within/row:pr-20 pr-7 pointer-coarse:pr-9"
							: "group-hover/row:pr-14 group-focus-within/row:pr-14 pointer-coarse:pr-2"
						: props.trailingAction
							? "pr-7 pointer-coarse:pr-9"
							: "",
				})}
			>
				<Content {...props} />
			</a>
		</RowFrame>
	);
}

/** A sidebar entry that does something (search, a new chat, choosing a folder). */
export function NavButton(
	props: NavItemProps & Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "children">,
): JSX.Element {
	const rest = omit(props, ...OWN);
	return (
		<RowFrame item={props}>
			<button
				type="button"
				{...rest}
				aria-current={props.current ? "page" : undefined}
				class={row({
					level: props.level,
					tone: props.tone,
					class: props.actions
						? props.trailingAction
							? "group-hover/row:pr-20 group-focus-within/row:pr-20 pr-7 pointer-coarse:pr-9"
							: "group-hover/row:pr-14 group-focus-within/row:pr-14 pointer-coarse:pr-2"
						: props.trailingAction
							? "pr-7 pointer-coarse:pr-9"
							: "",
				})}
			>
				<Content {...props} />
			</button>
		</RowFrame>
	);
}

/** Rows nested under a parent (a project's pages and threads), set in behind a guide line. */
export function NavGroup(props: { children: JSX.Element }): JSX.Element {
	return <div class="mb-1 ml-3 flex flex-col gap-px">{props.children}</div>;
}

/** A quiet line inside a nav group: nothing here yet, or why it could not load. */
export function NavNote(props: { children: JSX.Element }): JSX.Element {
	return <p class="px-2 py-1 text-caption text-fg-faint">{props.children}</p>;
}

/** A group in the sidebar: a quiet label, an optional action, then its items. */
export function NavSection(props: {
	label: string;
	action?: JSX.Element;
	children: JSX.Element;
}): JSX.Element {
	return (
		<section class="flex flex-col gap-px">
			<div class="group/section flex h-8 items-center justify-between pr-1 pl-2.5 pointer-coarse:h-9">
				<h3 class="font-medium text-caption text-fg-subtle">{props.label}</h3>
				<Show when={props.action}>
					<span class="opacity-0 transition-opacity duration-fast group-hover/section:opacity-100 group-focus-within/section:opacity-100 pointer-coarse:opacity-100">
						{props.action}
					</span>
				</Show>
			</div>
			{props.children}
		</section>
	);
}

export const railItem = variants({
	base: "focus-ring relative grid shrink-0 place-items-center rounded-kit text-fg-subtle transition-[background-color,color,box-shadow] duration-fast ease-out-grid select-none [-webkit-touch-callout:none] hover:bg-fill-strong hover:text-fg aria-[current=page]:surface-outline aria-[current=page]:bg-surface aria-[current=page]:text-fg [&_svg]:size-4",
	variants: {
		size: {
			/** The rail's 32px tile, with room for its name when rail labels are on. */
			rail: "size-8 rail-labels:h-auto rail-labels:min-h-11 rail-labels:w-15 rail-labels:content-center rail-labels:gap-0.5 rail-labels:py-1 pointer-coarse:size-11 pointer-coarse:[&_svg]:size-5",
			/** The floating sidebar's views row (the Figma Grid/Sidebar/Views row): icons only. */
			row: "size-6",
			/** A top bar's tile, as tall as its icon buttons. */
			bar: "size-kit-control pointer-coarse:size-11",
		},
	},
	defaults: { size: "rail" },
});

type RailItemProps = {
	/** The destination's name: its accessible name and its tooltip. */
	label: string;
	/** A fuller name for screen readers when the tile carries news ("Inbox, 3 unread"). */
	spoken?: string;
	icon: JSX.Element;
	current?: boolean;
	/** A dot on the corner for something waiting (unread Inbox items). */
	dot?: boolean;
	shortcut?: string;
	size?: "rail" | "row" | "bar";
};

function RailDot(props: { when?: boolean; size?: "rail" | "row" | "bar" }): JSX.Element {
	return (
		<Show when={props.when}>
			<span
				class={`absolute size-1.5 rounded-full bg-accent ring-2 ring-surface ${props.size === "row" ? "top-0.5 right-0.5" : "top-1.5 right-1.5"}`}
			/>
		</Show>
	);
}

/** One destination on the icon rail (the Figma Grid/Sidebar/Rail): a 36px tile, its name a tooltip. */
export function RailLink(
	props: RailItemProps & Omit<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, "children">,
): JSX.Element {
	const rest = omit(
		props,
		"label",
		"spoken",
		"icon",
		"current",
		"dot",
		"shortcut",
		"size",
		"class",
	);
	return (
		<a
			{...rest}
			aria-label={props.spoken ?? props.label}
			aria-current={props.current ? "page" : "false"}
			data-tooltip={props.label}
			data-shortcut={props.shortcut}
			class={railItem({ size: props.size, class: props.class })}
		>
			{props.icon}
			<Show when={props.size !== "row"}>
				<span class="hidden max-w-full truncate px-0.5 text-micro leading-tight rail-labels:block pointer-coarse:rail-labels:hidden">
					{props.label}
				</span>
			</Show>
			<RailDot when={props.dot} size={props.size} />
		</a>
	);
}

/** A rail tile that does something rather than going somewhere (the account menu, a toggle). */
export function RailButton(
	props: RailItemProps & Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "children">,
): JSX.Element {
	const rest = omit(
		props,
		"label",
		"spoken",
		"icon",
		"current",
		"dot",
		"shortcut",
		"size",
		"class",
	);
	return (
		<button
			type="button"
			{...rest}
			aria-label={props.spoken ?? props.label}
			data-tooltip={props.label}
			data-shortcut={props.shortcut}
			class={railItem({ size: props.size, class: props.class })}
		>
			{props.icon}
			<RailDot when={props.dot} size={props.size} />
		</button>
	);
}

/**
 * The floating sidebar (the Figma Desktop · Floating sidebar): a 232px card over the canvas with
 * the views row on top, a hairline, then the panel's body, as tall as what it holds. Both the row
 * and the body scroll inside the card — never a scrollbar, on a finger or a mouse — so a wide
 * views row or a long project list stays inside the card instead of spilling over the canvas.
 */
export function FloatingPanel(props: {
	label: string;
	views: JSX.Element;
	children: JSX.Element;
}): JSX.Element {
	let row: HTMLDivElement | undefined;
	onSettled(() => (row ? attachEdgeFade(row) : undefined));
	return (
		<nav
			aria-label={props.label}
			class="surface-card flex max-h-full min-h-0 w-full flex-col gap-1 overflow-hidden rounded-kit-2xl p-2"
		>
			<div
				ref={(el) => {
					row = el;
				}}
				class="edge-fade -mx-0.5 flex h-7 shrink-0 items-center gap-0.5 overflow-x-auto overscroll-x-contain px-0.5 scrollbar-none"
			>
				{props.views}
			</div>
			<span aria-hidden="true" class="h-px w-full shrink-0 bg-line" />
			<div class="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain scrollbar-none">
				{props.children}
			</div>
		</nav>
	);
}

/** The panel's 52px head (the Figma Grid/Sidebar/Panel header): its title and a few icon actions. */
export function PanelHeader(props: { title: JSX.Element; actions?: JSX.Element }): JSX.Element {
	return (
		<div class="flex h-13 shrink-0 items-center gap-0.5 border-line border-b pr-3 pl-4 pointer-coarse:h-14">
			<h2 class="min-w-0 flex-1 truncate font-medium text-body-lg text-fg">{props.title}</h2>
			<Show when={props.actions}>{props.actions}</Show>
		</div>
	);
}

/** The mark on a 28px outlined tile, as the rail's head and the drawer show it. */
export function BrandTile(): JSX.Element {
	return (
		<span class="surface-outline grid size-7 place-items-center rounded-kit">
			<BrandMark class="size-4" />
		</span>
	);
}
