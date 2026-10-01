import type { JSX } from "@solidjs/web";
import { omit, onSettled, Show } from "solid-js";

import { BrandMark } from "./brand";
import { attachContextMenu, type MenuPoint } from "./context-menu";
import { variants } from "./variants";

const row = variants({
	// The Figma panel row: 13px medium in the muted ink, a flat grey selection (bg/selected).
	base: "focus-ring group/nav flex w-full min-w-0 items-center gap-2 rounded-kit text-left font-medium text-fg-muted transition-[background-color,color] duration-fast ease-out-grid select-none [-webkit-touch-callout:none] hover:bg-fill-strong hover:text-fg aria-[current=page]:bg-selection aria-[current=page]:text-fg",
	variants: {
		// Top-level destinations and projects; threads and a project's pages one step down.
		level: {
			0: "h-kit-row px-2 text-nav",
			1: "h-[calc(var(--kit-h-row)-0.25rem)] px-2 text-body pointer-coarse:h-11",
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
	/** Right-hand detail at rest: a count, a shortcut, a time, a badge. Hidden while actions show. */
	trailing?: JSX.Element;
	/**
	 * Row actions for pointers (a plus, a ⋯ menu): revealed on hover or keyboard focus, never drawn
	 * on touch screens, where a long press on the row opens the menu instead.
	 */
	actions?: JSX.Element;
	/** Right-click (desktop) and long press (touch) on the row. */
	onMenuAt?: (point: MenuPoint) => void;
	current?: boolean;
	level?: 0 | 1;
	tone?: "default" | "accent" | "danger";
	/** Layout only. */
	class?: string;
};

const OWN = [
	"icon",
	"label",
	"trailing",
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
				<span class="grid size-3.5 shrink-0 place-items-center text-fg-subtle group-hover/nav:text-fg-muted group-aria-[current=page]/nav:text-fg [&_svg]:size-3.5 pointer-coarse:size-4 pointer-coarse:[&_svg]:size-4">
					{props.icon}
				</span>
			</Show>
			<span class="min-w-0 flex-1 truncate">{props.label}</span>
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
		const open = props.item.onMenuAt;
		return frame && open ? attachContextMenu(frame, open) : undefined;
	});
	return (
		<div
			ref={(el) => {
				frame = el;
			}}
			class={`group/row relative min-w-0 ${props.item.class ?? ""}`}
		>
			{props.children}
			<Show when={props.item.actions}>
				<div class="absolute inset-y-0 right-1 flex items-center gap-0.5 opacity-0 transition-opacity duration-fast group-hover/row:opacity-100 focus-within:opacity-100 pointer-coarse:pointer-events-none pointer-coarse:opacity-0">
					{props.item.actions}
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
					level: props.level,
					tone: props.tone,
					class: props.actions ? "pr-14 pointer-coarse:pr-2.5" : "",
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
					class: props.actions ? "pr-14 pointer-coarse:pr-2.5" : "",
				})}
			>
				<Content {...props} />
			</button>
		</RowFrame>
	);
}

/** Rows nested under a parent (a project's pages and threads), set in behind a guide line. */
export function NavGroup(props: { children: JSX.Element }): JSX.Element {
	return (
		<div class="mb-1 ml-4 flex flex-col gap-px border-line border-l pl-1.5">{props.children}</div>
	);
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
	base: "focus-ring relative grid size-9 shrink-0 place-items-center rounded-kit text-fg-subtle transition-[background-color,color,box-shadow] duration-fast ease-out-grid select-none [-webkit-touch-callout:none] hover:bg-fill-strong hover:text-fg aria-[current=page]:surface-outline aria-[current=page]:bg-surface aria-[current=page]:text-fg [&_svg]:size-4 pointer-coarse:size-11 pointer-coarse:[&_svg]:size-5",
	variants: {},
	defaults: {},
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
};

function RailDot(props: { when?: boolean }): JSX.Element {
	return (
		<Show when={props.when}>
			<span class="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-accent ring-2 ring-surface" />
		</Show>
	);
}

/** One destination on the icon rail (the Figma Grid/Sidebar/Rail): a 36px tile, its name a tooltip. */
export function RailLink(
	props: RailItemProps & Omit<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, "children">,
): JSX.Element {
	const rest = omit(props, "label", "spoken", "icon", "current", "dot", "shortcut", "class");
	return (
		<a
			{...rest}
			aria-label={props.spoken ?? props.label}
			aria-current={props.current ? "page" : "false"}
			data-tooltip={props.label}
			data-shortcut={props.shortcut}
			class={railItem({ class: props.class })}
		>
			{props.icon}
			<RailDot when={props.dot} />
		</a>
	);
}

/** A rail tile that does something rather than going somewhere (the account menu, a toggle). */
export function RailButton(
	props: RailItemProps & Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "children">,
): JSX.Element {
	const rest = omit(props, "label", "spoken", "icon", "current", "dot", "shortcut", "class");
	return (
		<button
			type="button"
			{...rest}
			aria-label={props.spoken ?? props.label}
			data-tooltip={props.label}
			data-shortcut={props.shortcut}
			class={railItem({ class: props.class })}
		>
			{props.icon}
			<RailDot when={props.dot} />
		</button>
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

/**
 * The panel's foot (the Figma Grid/Sidebar/Machine card): a machine's tile, its name and state,
 * and a dot that is green while it is online.
 */
export function MachineCard(props: {
	href: string;
	name: string;
	detail: string;
	online: boolean;
	icon: JSX.Element;
}): JSX.Element {
	return (
		<a
			href={props.href}
			class="focus-ring surface-card flex items-center gap-2 p-2 transition-colors duration-fast hover:bg-fill"
		>
			<span class="grid size-7 shrink-0 place-items-center rounded-kit bg-fill-strong text-fg-muted ring-line [&_svg]:size-3.5">
				{props.icon}
			</span>
			<span class="flex min-w-0 flex-1 flex-col">
				<span class="truncate font-medium text-body text-fg">{props.name}</span>
				<span class="truncate text-caption text-fg-subtle">{props.detail}</span>
			</span>
			<span
				aria-hidden="true"
				class={`mr-1.5 size-2 shrink-0 rounded-full ${props.online ? "bg-success" : "bg-fg-faint"}`}
			/>
		</a>
	);
}
