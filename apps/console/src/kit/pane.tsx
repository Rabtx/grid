import type { JSX } from "@solidjs/web";
import { onSettled, Show } from "solid-js";

import { attachContextMenu, type MenuPoint } from "./context-menu";
import { iconButton } from "./button";
import { BackIcon } from "./icons";

/**
 * A list beside what is open in it: files and the file, notes and the note. From md both show,
 * the list in a fixed column; on phones one at a time, the open item over the list with a way
 * back in its header. The caller says whether something is open.
 */
export function ListDetail(props: {
	list: JSX.Element;
	/** Something is open: on phones the detail replaces the list. */
	open: boolean;
	children: JSX.Element;
}): JSX.Element {
	return (
		<div class="flex min-h-0 flex-1">
			<section
				class={`min-h-0 w-full shrink-0 flex-col border-line md:flex md:w-72 md:border-r ${props.open ? "hidden" : "flex"}`}
			>
				{props.list}
			</section>
			<section class={`min-h-0 min-w-0 flex-1 flex-col ${props.open ? "flex" : "hidden md:flex"}`}>
				{props.children}
			</section>
		</div>
	);
}

/**
 * The bar across the top of a pane: its title (and a count or path beside it), its actions on the
 * right. `onBack` draws a back button on phones, where the pane covers the list it came from.
 * Once the pane's content scrolls under it, a soft shade appears below its divider.
 */
export function PaneHeader(props: {
	title: JSX.Element;
	detail?: JSX.Element;
	actions?: JSX.Element;
	onBack?: () => void;
	backLabel?: string;
}): JSX.Element {
	let header: HTMLElement | undefined;
	onSettled(() => {
		const pane = header?.parentElement;
		if (!header || !pane) return;
		const bar = header;
		// Any vertical scroller in this pane, including lists that load after the header.
		const onScroll = (event: Event) => {
			const scroller = event.target;
			if (!(scroller instanceof HTMLElement) || scroller === bar || bar.contains(scroller)) return;
			bar.toggleAttribute("data-scrolled", scroller.scrollTop > 2);
		};
		pane.addEventListener("scroll", onScroll, true);
		return () => pane.removeEventListener("scroll", onScroll, true);
	});
	return (
		<header
			ref={(el) => {
				header = el;
			}}
			class="relative z-10 flex h-11 shrink-0 items-center gap-1.5 border-line border-b px-2 transition-shadow duration-base data-scrolled:shadow-pane md:px-3"
		>
			<Show when={props.onBack}>
				<button
					type="button"
					aria-label={props.backLabel ?? "Back"}
					onClick={() => props.onBack?.()}
					class={iconButton({ size: "md", class: "-ml-0.5 md:hidden" })}
				>
					<BackIcon />
				</button>
			</Show>
			<div class="flex min-w-0 flex-1 items-baseline gap-2 pl-1 md:pl-0">
				<h2 class="min-w-0 truncate font-medium text-body-lg text-fg">{props.title}</h2>
				<Show when={props.detail}>
					<span class="min-w-0 truncate text-caption text-fg-subtle">{props.detail}</span>
				</Show>
			</div>
			<Show when={props.actions}>
				<div class="flex shrink-0 items-center gap-0.5">{props.actions}</div>
			</Show>
		</header>
	);
}

/**
 * One item in a pane's list: a title, a quieter line under it, a detail on the right (a time).
 * The open one is lit. Actions show on hover for pointers; right-click and long press call
 * `onMenuAt`.
 */
export function ListRow(props: {
	title: string;
	subtitle?: string;
	trailing?: JSX.Element;
	icon?: JSX.Element;
	current?: boolean;
	onClick: () => void;
	actions?: JSX.Element;
	onMenuAt?: (point: MenuPoint) => void;
}): JSX.Element {
	let frame: HTMLDivElement | undefined;
	onSettled(() => {
		const open = props.onMenuAt;
		return frame && open ? attachContextMenu(frame, open) : undefined;
	});
	return (
		<div
			ref={(el) => {
				frame = el;
			}}
			class="group/row relative select-none [-webkit-touch-callout:none]"
		>
			<button
				type="button"
				aria-current={props.current ? "true" : undefined}
				onClick={() => props.onClick()}
				class={`focus-ring flex w-full min-w-0 items-start gap-2.5 rounded-kit-md px-2.5 py-2 text-left transition-colors duration-fast hover:bg-fill aria-[current=true]:bg-fill-strong pointer-coarse:py-3 ${props.actions ? "pr-9 pointer-coarse:pr-2.5" : ""}`}
			>
				<RowText {...props} />
			</button>
			<Show when={props.actions}>
				<div class="absolute top-1.5 right-1.5 opacity-0 transition-opacity duration-fast group-hover/row:opacity-100 focus-within:opacity-100 pointer-coarse:pointer-events-none pointer-coarse:opacity-0">
					{props.actions}
				</div>
			</Show>
		</div>
	);
}

function RowText(props: {
	title: string;
	subtitle?: string;
	trailing?: JSX.Element;
	icon?: JSX.Element;
	actions?: JSX.Element;
}): JSX.Element {
	return (
		<>
			<Show when={props.icon}>
				<span class="mt-0.5 grid size-4 shrink-0 place-items-center text-fg-subtle">
					{props.icon}
				</span>
			</Show>
			<span class="flex min-w-0 flex-1 flex-col gap-0.5">
				<span class="flex min-w-0 items-baseline gap-2">
					<span class="min-w-0 flex-1 truncate text-body text-fg">{props.title}</span>
					<Show when={props.trailing}>
						<span
							class={`shrink-0 text-caption text-fg-faint tabular-nums ${props.actions ? "group-hover/row:invisible pointer-coarse:visible" : ""}`}
						>
							{props.trailing}
						</span>
					</Show>
				</span>
				<Show when={props.subtitle}>
					<span class="line-clamp-2 break-words text-caption text-fg-subtle">{props.subtitle}</span>
				</Show>
			</span>
		</>
	);
}
