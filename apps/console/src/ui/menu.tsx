import type { JSX } from "@solidjs/web";
import { createUniqueId, For, Show } from "solid-js";

import type { MenuPoint } from "./context-menu";

/** Open a menu from code: at a point (a right-click, a long press), or under its trigger. */
export type MenuControl = { open: (point?: MenuPoint) => void };

export type MenuItem = {
	id: string;
	label: string;
	icon?: JSX.Element;
	danger?: boolean;
	disabled?: boolean;
};

const TRIGGER_CLASS =
	"focus-ring inline-flex size-control shrink-0 select-none items-center justify-center rounded-md text-ink/50 transition-[background-color,color,transform] duration-fast ease-out-grid hover:bg-ink/8 hover:text-ink active:scale-[0.96] pointer-coarse:min-h-10 pointer-coarse:min-w-10";

// Phones: bottom sheet, full width, safe-area padded. From md: clears the sheet insets so CSS
// anchor positioning (`position-area`) or the JS fallback can place it under the trigger.
const SURFACE_CLASS =
	"fixed inset-x-0 bottom-0 top-auto m-0 min-w-44 w-full rounded-t-xl border border-b-0 border-ink/10 bg-canvas p-1 shadow-xl pb-[max(0.25rem,env(safe-area-inset-bottom))] md:inset-auto md:w-auto md:rounded-xl md:border-b md:pb-1 md:[position-area:block-end_span-inline-end] md:[position-try-fallbacks:flip-block]";

const ITEM_CLASS =
	"flex h-row w-full items-center gap-2 rounded-md px-2 text-left text-ui-sm focus-ring pointer-coarse:min-h-11";

function supportsAnchorPositioning(): boolean {
	return (
		typeof CSS !== "undefined" &&
		typeof CSS.supports === "function" &&
		CSS.supports("position-area: block-end")
	);
}

/**
 * A trigger plus a list of actions. Built on the native Popover API (`popover="auto"` /
 * `popovertarget`) so light-dismiss and Escape come for free. On phones the list is a bottom
 * sheet; from `md:` it anchors under the trigger via CSS anchor positioning, with a JS
 * fallback when the browser lacks `position-area`.
 */
export function Menu(props: {
	label: string;
	trigger: JSX.Element;
	items: readonly MenuItem[];
	onSelect: (id: string) => void;
	/**
	 * Row menus: the trigger is for pointers only. Touch screens open the menu with a long press
	 * on the row (see `attachContextMenu`), as native lists do, so no dots are drawn there.
	 */
	pointerOnly?: boolean;
	/** Hands over a way to open the menu from code, for right-click and long press. */
	control?: (control: MenuControl) => void;
}): JSX.Element {
	const uid = createUniqueId().replace(/[^a-zA-Z0-9_-]/g, "");
	const listId = `menu-${uid}`;
	const anchorName = `--menu-${uid}`;
	const anchorOk = supportsAnchorPositioning();
	let triggerEl: HTMLButtonElement | undefined;
	let listEl: HTMLElement | undefined;
	let openAt: MenuPoint | null = null;

	props.control?.({
		open: (point) => {
			const el = listEl as (HTMLElement & { showPopover?: () => void }) | undefined;
			openAt = point ?? null;
			el?.showPopover?.();
		},
	});

	function focusFirstItem(): void {
		listEl?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
	}

	function focusLastItem(): void {
		const buttons = listEl?.querySelectorAll<HTMLButtonElement>("button:not([disabled])");
		buttons?.[buttons.length - 1]?.focus();
	}

	function moveFocus(delta: number): void {
		const buttons = listEl?.querySelectorAll<HTMLButtonElement>("button:not([disabled])");
		if (!buttons || buttons.length === 0) return;
		const list = Array.from(buttons);
		const current = list.indexOf(document.activeElement as HTMLButtonElement);
		const next = current < 0 ? 0 : (current + delta + list.length) % list.length;
		list[next]?.focus();
	}

	function closeInlinePositioning(): void {
		if (!listEl) return;
		listEl.style.position = "";
		listEl.style.top = "";
		listEl.style.left = "";
		listEl.style.right = "";
		listEl.style.bottom = "";
		listEl.style.margin = "";
	}

	function handleToggle(event: Event): void {
		const target = event.currentTarget as HTMLElement;
		const open = target.matches(":popover-open");
		if (open) {
			// Opened at a point (right-click, long press) from md up: place it there, kept on screen.
			// Phones keep the bottom sheet, which is where a thumb expects it.
			if (openAt && window.matchMedia("(min-width: 48rem)").matches) {
				target.style.position = "fixed";
				target.style.margin = "0";
				target.style.right = "auto";
				target.style.bottom = "auto";
				const surface = target.getBoundingClientRect();
				const left = Math.min(openAt.x, window.innerWidth - surface.width - 8);
				const top =
					openAt.y + surface.height + 8 > window.innerHeight
						? Math.max(8, openAt.y - surface.height)
						: openAt.y;
				target.style.left = `${Math.max(8, left)}px`;
				target.style.top = `${top}px`;
				// Anchor positioning would pull it back under the (possibly hidden) trigger.
				target.style.setProperty("position-area", "none");
			} else if (
				!anchorOk &&
				triggerEl &&
				typeof window !== "undefined" &&
				window.matchMedia("(min-width: 48rem)").matches
			) {
				const rect = triggerEl.getBoundingClientRect();
				target.style.position = "fixed";
				target.style.top = `${rect.bottom + 4}px`;
				target.style.left = `${rect.left}px`;
				target.style.right = "auto";
				target.style.bottom = "auto";
				target.style.margin = "0";
				const surface = target.getBoundingClientRect();
				if (surface.bottom > window.innerHeight - 8 && rect.top - surface.height - 4 > 8) {
					target.style.top = `${rect.top - surface.height - 4}px`;
				}
			}
			focusFirstItem();
		} else {
			closeInlinePositioning();
			listEl?.style.removeProperty("position-area");
			// Focus goes back to the trigger only when the trigger opened it and can be seen.
			if (!openAt) triggerEl?.focus();
			openAt = null;
		}
	}

	function handleKeyDown(event: KeyboardEvent): void {
		switch (event.key) {
			case "ArrowDown":
				event.preventDefault();
				moveFocus(1);
				break;
			case "ArrowUp":
				event.preventDefault();
				moveFocus(-1);
				break;
			case "Home":
				event.preventDefault();
				focusFirstItem();
				break;
			case "End":
				event.preventDefault();
				focusLastItem();
				break;
		}
	}

	function selectItem(item: MenuItem): void {
		if (item.disabled) return;
		const el = listEl as (HTMLElement & { hidePopover?: () => void }) | undefined;
		el?.hidePopover?.();
		props.onSelect(item.id);
	}

	return (
		<>
			<button
				type="button"
				ref={(el) => {
					triggerEl = el;
				}}
				aria-label={props.label}
				title={props.label}
				popovertarget={listId}
				style={anchorOk ? `anchor-name: ${anchorName}` : undefined}
				class={`${TRIGGER_CLASS} ${props.pointerOnly ? "pointer-coarse:hidden" : ""}`}
			>
				{props.trigger}
			</button>
			<div
				id={listId}
				ref={(el) => {
					listEl = el;
				}}
				popover="auto"
				role="menu"
				tabindex={-1}
				aria-label={props.label}
				onToggle={handleToggle}
				onKeyDown={handleKeyDown}
				style={anchorOk ? `position-anchor: ${anchorName}` : undefined}
				class={SURFACE_CLASS}
			>
				<For each={props.items}>
					{(item) => (
						<button
							type="button"
							role="menuitem"
							disabled={item.disabled}
							onClick={() => selectItem(item)}
							class={`${ITEM_CLASS} ${item.danger ? "text-danger hover:bg-danger/10" : "text-ink/80 hover:bg-ink/10"}`}
						>
							<Show when={item.icon}>{item.icon}</Show>
							<span class="truncate">{item.label}</span>
						</button>
					)}
				</For>
			</div>
		</>
	);
}
