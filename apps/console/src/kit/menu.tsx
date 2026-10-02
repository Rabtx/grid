import type { JSX } from "@solidjs/web";
import { For, onSettled, Show } from "solid-js";

import { Kbd } from "./badge";
import { ICON_SIZE } from "./button";
import { shortcutKeys } from "./keys";
import { Popover, type Placement, type PopoverControl } from "./popover";
import { variants } from "./variants";

export type MenuItem = {
	id: string;
	label: string;
	/** A second, quieter line under the label, on phones (the desktop menu stays one line). */
	description?: string;
	icon?: JSX.Element;
	/** The tint of the icon's tile in a `tiles` group. */
	tone?: "accent" | "violet" | "success" | "warning" | "danger";
	/** A keyboard shortcut shown on the right. */
	shortcut?: string;
	/** Trailing content instead of a shortcut: a check, a switch, a count. */
	trailing?: JSX.Element;
	danger?: boolean;
	disabled?: boolean;
};

/**
 * Groups of items, drawn with a divider between them; a group may have a caption. A `tiles`
 * group is a row of tinted tiles on phones (Figma's "Add to message" sheet) and plain rows
 * from md.
 */
export type MenuGroup = { label?: string; look?: "rows" | "tiles"; items: readonly MenuItem[] };

const TINT: Record<NonNullable<MenuItem["tone"]>, string> = {
	accent: "tint-accent",
	violet: "tint-violet",
	success: "tint-success",
	warning: "tint-warning",
	danger: "tint-danger",
};

/** A tile on phones, a row from md. */
const MENU_TILE =
	"focus-ring flex min-w-0 flex-col items-center justify-center gap-2 rounded-kit-xl bg-fill py-3 text-caption text-fg transition-colors duration-fast hover:bg-fill-strong disabled:pointer-events-none disabled:opacity-40 md:h-kit-row md:flex-row md:justify-start md:gap-2.5 md:rounded-kit-md md:bg-transparent md:px-2 md:py-0 md:text-left md:text-nav md:hover:bg-fill";

const TILE_ICON =
	"grid size-10 shrink-0 place-items-center rounded-kit-lg [&_svg]:size-5 md:size-4 md:rounded-none md:bg-transparent md:text-fg-subtle md:shadow-none md:[&_svg]:size-4";

/** What opens a menu from the navigation: the workspace switcher, your account, a picker. */
export const menuTrigger = variants({
	base: "focus-ring flex min-w-0 items-center gap-2 rounded-kit px-1.5 text-left transition-colors duration-fast hover:bg-fill aria-expanded:bg-fill-strong",
	variants: {
		size: { sm: "h-kit-control", md: "h-kit-control-lg text-body-lg" },
		width: { auto: "", fill: "flex-1", full: "w-full" },
		shape: {
			default: "",
			icon: `icon-tile size-kit-control shrink-0 justify-center px-0 text-fg-muted hover:text-fg ${ICON_SIZE.md}`,
		},
	},
	defaults: { size: "sm", width: "auto", shape: "default" },
});

export const MENU_ITEM =
	"focus-ring flex h-kit-row w-full min-w-0 items-center gap-2.5 rounded-kit-md px-2 text-left text-nav transition-colors duration-fast ease-out-grid disabled:pointer-events-none disabled:opacity-40 pointer-coarse:h-12";

/** The inside of a menu, reusable wherever a list of actions floats (menus, the account panel). */
export function MenuList(props: {
	groups: readonly MenuGroup[];
	onSelect: (id: string) => void;
	onClose?: () => void;
	header?: JSX.Element;
	footer?: JSX.Element;
}): JSX.Element {
	let menuEl: HTMLDivElement | undefined;

	onSettled(() => {
		requestAnimationFrame(() => {
			const first = menuEl?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)');
			first?.focus();
		});
	});

	function handleKeyDown(event: KeyboardEvent): void {
		const items = Array.from(
			menuEl?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [],
		);
		if (!items.length) return;
		const current = document.activeElement as HTMLButtonElement;
		const idx = items.indexOf(current);

		if (event.key === "ArrowDown") {
			event.preventDefault();
			const next = idx === -1 || idx === items.length - 1 ? 0 : idx + 1;
			items[next]?.focus();
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			const prev = idx <= 0 ? items.length - 1 : idx - 1;
			items[prev]?.focus();
		} else if (event.key === "Home") {
			event.preventDefault();
			items[0]?.focus();
		} else if (event.key === "End") {
			event.preventDefault();
			items[items.length - 1]?.focus();
		} else if (event.key === "Escape") {
			props.onClose?.();
		}
	}

	return (
		<div
			ref={(el) => {
				menuEl = el;
			}}
			role="menu"
			tabindex="-1"
			onKeyDown={handleKeyDown}
			class="flex flex-col p-1.5 md:p-1"
		>
			{props.header}
			<For each={props.groups}>
				{(group, index) => (
					<>
						<Show when={index() > 0 || props.header}>
							<div class="-mx-1.5 my-1 h-px bg-line md:-mx-1" />
						</Show>
						<Show when={group.label}>
							<p class="px-2 pt-1 pb-1 text-caption text-fg-subtle">{group.label}</p>
						</Show>
						<Show
							when={group.look === "tiles"}
							fallback={
								<For each={group.items}>
									{(item) => <MenuRow item={item} onSelect={props.onSelect} />}
								</For>
							}
						>
							<div class="grid auto-cols-fr grid-flow-col gap-2 px-1.5 pb-2 md:flex md:flex-col md:gap-0 md:p-0">
								<For each={group.items}>
									{(item) => (
										<button
											type="button"
											role="menuitem"
											disabled={item.disabled}
											onClick={() => props.onSelect(item.id)}
											class={MENU_TILE}
										>
											<span class={`${TILE_ICON} ${TINT[item.tone ?? "accent"]}`}>{item.icon}</span>
											<span class="min-w-0 truncate md:flex-1">{item.label}</span>
											<Show when={item.shortcut}>
												{(shortcut) => (
													<span class="hidden shrink-0 items-center gap-0.5 md:flex pointer-coarse:hidden">
														<For each={shortcutKeys(shortcut())}>{(key) => <Kbd>{key}</Kbd>}</For>
													</span>
												)}
											</Show>
										</button>
									)}
								</For>
							</div>
						</Show>
					</>
				)}
			</For>
			{props.footer}
		</div>
	);
}

/** One action in a menu: icon, label (and a line under it), and a shortcut or trailing part. */
function MenuRow(props: { item: MenuItem; onSelect: (id: string) => void }): JSX.Element {
	const item = () => props.item;
	return (
		<button
			type="button"
			role="menuitem"
			disabled={item().disabled}
			onClick={() => props.onSelect(item().id)}
			class={`${MENU_ITEM} ${item().description ? "h-auto min-h-kit-row py-2 md:py-0" : ""} ${item().danger ? "text-danger hover:bg-danger/8" : "text-fg hover:bg-fill"}`}
		>
			<Show when={item().icon}>
				<span
					class={`grid size-4 shrink-0 place-items-center ${item().danger ? "" : "text-fg-subtle"}`}
				>
					{item().icon}
				</span>
			</Show>
			<span class="flex min-w-0 flex-1 flex-col">
				<span class="truncate">{item().label}</span>
				<Show when={item().description}>
					<span class="truncate text-caption text-fg-subtle md:hidden">{item().description}</span>
				</Show>
			</span>
			<Show
				when={item().trailing}
				fallback={
					<Show when={item().shortcut}>
						{(shortcut) => (
							<span class="flex shrink-0 items-center gap-0.5 pointer-coarse:hidden">
								<For each={shortcutKeys(shortcut())}>{(key) => <Kbd>{key}</Kbd>}</For>
							</span>
						)}
					</Show>
				}
			>
				{item().trailing}
			</Show>
		</button>
	);
}

/** A trigger and its menu: anchored on desktop, a bottom sheet on phones. */
export function Menu(props: {
	label: string;
	trigger: JSX.Element;
	triggerClass: string;
	groups: readonly MenuGroup[];
	onSelect: (id: string) => void;
	placement?: Placement;
	width?: string;
	header?: JSX.Element;
	footer?: JSX.Element;
	control?: (control: PopoverControl) => void;
	pointerOnly?: boolean;
	/** The phone sheet's heading. */
	title?: string;
}): JSX.Element {
	return (
		<Popover
			title={props.title}
			control={props.control}
			pointerOnly={props.pointerOnly}
			label={props.label}
			trigger={props.trigger}
			triggerClass={props.triggerClass}
			placement={props.placement}
			width={props.width}
		>
			{(close) => (
				<MenuList
					groups={props.groups}
					header={props.header}
					footer={props.footer}
					onClose={close}
					onSelect={(id) => {
						close();
						props.onSelect(id);
					}}
				/>
			)}
		</Popover>
	);
}
