import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";

import { Popover, type Placement } from "./popover";

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

export const MENU_ITEM =
	"focus-ring flex h-kit-row w-full min-w-0 items-center gap-2.5 rounded-kit-md px-2 text-left text-nav transition-colors duration-fast ease-out-grid disabled:pointer-events-none disabled:opacity-40 pointer-coarse:h-12";

/** The inside of a menu, reusable wherever a list of actions floats (menus, the account panel). */
export function MenuList(props: {
	groups: readonly MenuGroup[];
	onSelect: (id: string) => void;
	header?: JSX.Element;
	footer?: JSX.Element;
}): JSX.Element {
	return (
		<div role="menu" class="flex flex-col p-1.5 md:p-1">
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
}): JSX.Element {
	return (
		<Popover
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
					onSelect={(id) => {
						close();
						props.onSelect(id);
					}}
				/>
			)}
		</Popover>
	);
}
