import type { JSX } from "@solidjs/web";
import { For, onSettled, Show } from "solid-js";

import { ICON_SIZE } from "./button";
import { Popover, type Placement, type PopoverControl } from "./popover";
import { variants } from "./variants";

export type MenuItem = {
	id: string;
	label: string;
	icon?: JSX.Element;
	/** A keyboard shortcut shown on the right. */
	shortcut?: string;
	/** Trailing content instead of a shortcut: a check, a switch, a count. */
	trailing?: JSX.Element;
	danger?: boolean;
	disabled?: boolean;
};

/** Groups of items, drawn with a divider between them; a group may have a caption. */
export type MenuGroup = { label?: string; items: readonly MenuItem[] };

/** What opens a menu from the navigation: the workspace switcher, your account, a picker. */
export const menuTrigger = variants({
	base: "focus-ring flex min-w-0 items-center gap-2 rounded-kit px-1.5 text-left transition-colors duration-fast hover:bg-fill aria-expanded:bg-fill-strong",
	variants: {
		size: { sm: "h-8 pointer-coarse:h-11", md: "h-9 text-body-lg pointer-coarse:h-12" },
		width: { auto: "", fill: "flex-1", full: "w-full" },
		shape: {
			default: "",
			icon: `icon-tile size-8 shrink-0 justify-center px-0 text-fg-muted hover:text-fg pointer-coarse:size-11 ${ICON_SIZE.md}`,
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
						<For each={group.items}>
							{(item) => (
								<button
									type="button"
									role="menuitem"
									disabled={item.disabled}
									onClick={() => props.onSelect(item.id)}
									class={`${MENU_ITEM} ${item.danger ? "text-danger hover:bg-danger/8" : "text-fg hover:bg-fill"}`}
								>
									<Show when={item.icon}>
										<span
											class={`grid size-4 shrink-0 place-items-center ${item.danger ? "" : "text-fg-subtle"}`}
										>
											{item.icon}
										</span>
									</Show>
									<span class="min-w-0 flex-1 truncate">{item.label}</span>
									<Show
										when={item.trailing}
										fallback={
											<Show when={item.shortcut}>
												<span class="text-caption text-fg-faint pointer-coarse:hidden">
													{item.shortcut}
												</span>
											</Show>
										}
									>
										{item.trailing}
									</Show>
								</button>
							)}
						</For>
					</>
				)}
			</For>
			{props.footer}
		</div>
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
}): JSX.Element {
	return (
		<Popover
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
