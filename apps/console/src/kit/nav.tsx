import type { JSX } from "@solidjs/web";
import { omit, onSettled, Show } from "solid-js";

import { attachContextMenu, type MenuPoint } from "./context-menu";
import { variants } from "./variants";

const row = variants({
	base: "focus-ring group/nav flex w-full min-w-0 items-center gap-2.5 rounded-kit-md text-left text-fg-muted transition-[background-color,color,box-shadow] duration-fast ease-out-grid select-none [-webkit-touch-callout:none] hover:bg-fill hover:text-fg aria-[current=page]:bg-fill-strong aria-[current=page]:text-fg depth:aria-[current=page]:bg-surface depth:aria-[current=page]:shadow-lift",
	variants: {
		// Top-level destinations and projects; threads and a project's pages one step down.
		level: {
			0: "h-kit-row px-2.5 text-nav",
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
	/** The icon on a tile, for the one primary action in a list (New chat). */
	iconTile?: boolean;
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
	"iconTile",
	"class",
] as const;

function Content(props: NavItemProps): JSX.Element {
	return (
		<>
			<Show when={props.icon}>
				<span
					class={`grid shrink-0 place-items-center text-fg-subtle group-hover/nav:text-fg-muted group-aria-[current=page]/nav:text-fg [&_svg]:size-4 ${props.iconTile ? "icon-tile -mx-1 size-6 rounded-kit-sm text-fg-muted" : "size-4"}`}
				>
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
				<div class="absolute inset-y-0 right-1 flex items-center gap-0.5 opacity-0 transition-opacity duration-fast group-hover/row:opacity-100 focus-within:opacity-100 pointer-coarse:hidden">
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
				<h3 class="text-body text-fg-subtle">{props.label}</h3>
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
