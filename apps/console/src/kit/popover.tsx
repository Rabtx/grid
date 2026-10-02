import type { JSX } from "@solidjs/web";
import {
	createContext,
	createEffect,
	createSignal,
	createUniqueId,
	Show,
	useContext,
} from "solid-js";

import type { MenuPoint } from "./context-menu";
import { CloseIcon } from "./icons";

export type Placement = "bottom-start" | "bottom-end" | "top-start" | "top-end";

/** Open or close a popover from code: under its trigger, or at a point (right-click, long press). */
export type PopoverControl = { open: (point?: MenuPoint) => void; close: () => void };

// Phones: a bottom sheet with a grabber. From md: anchored to the trigger with CSS anchor
// positioning (or a measured fallback), flipping when it would leave the screen.
const SURFACE =
	"fixed inset-x-0 top-auto bottom-0 m-0 max-h-[85dvh] w-full overflow-y-auto rounded-t-kit-2xl bg-surface-raised p-0 text-fg shadow-float pb-[env(safe-area-inset-bottom)] md:inset-auto md:max-h-[min(34rem,75dvh)] md:rounded-kit-xl md:pb-0 md:[position-try-fallbacks:flip-block,flip-inline]";

const AREA: Record<Placement, string> = {
	"bottom-start": "md:[position-area:block-end_span-inline-end] md:mt-1.5",
	"bottom-end": "md:[position-area:block-end_span-inline-start] md:mt-1.5",
	"top-start": "md:[position-area:block-start_span-inline-end] md:-mt-1.5",
	"top-end": "md:[position-area:block-start_span-inline-start] md:-mt-1.5",
};

/**
 * What popovers inside it open against, instead of their trigger: the composer, so a menu on its
 * toolbar opens above the whole card (Figma 10 · Composer) rather than over its text.
 */
export const PopoverAnchor = createContext<() => HTMLElement | undefined>(() => undefined);

const anchoring = () =>
	typeof CSS !== "undefined" &&
	typeof CSS.supports === "function" &&
	CSS.supports("position-area: block-end");

/**
 * A trigger and a floating panel on the native Popover API: tapping outside and Escape close
 * it. The panel renders only while open and gets `close` to call after a choice.
 */
export function Popover(props: {
	label: string;
	trigger: JSX.Element;
	triggerClass: string;
	placement?: Placement;
	/** Width from md; the phone sheet is always full width. */
	width?: string;
	disabled?: boolean;
	/** Hands over a way to open it from code, e.g. from a row's context menu. */
	control?: (control: PopoverControl) => void;
	/**
	 * Row menus: the trigger shows for pointers only. Touch screens open the menu with a long
	 * press on the row instead, as native lists do, so no dots are drawn there.
	 */
	pointerOnly?: boolean;
	/** The phone sheet's heading, with a close button beside it (Figma's sheets). */
	title?: string;
	children: (close: () => void) => JSX.Element;
}): JSX.Element {
	const uid = createUniqueId().replace(/[^a-zA-Z0-9_-]/g, "");
	const id = `kit-popover-${uid}`;
	const anchor = `--kit-anchor-${uid}`;
	const anchored = anchoring();
	const surround = useContext(PopoverAnchor);
	const [open, setOpen] = createSignal(false);
	let trigger: HTMLButtonElement | undefined;
	let panel: (HTMLDivElement & { hidePopover?: () => void; showPopover?: () => void }) | undefined;
	let at: MenuPoint | null = null;

	props.control?.({
		open: (point) => {
			at = point ?? null;
			panel?.showPopover?.();
		},
		close: () => panel?.hidePopover?.(),
	});

	function place(): void {
		if (!panel || !matchMedia("(min-width: 48rem)").matches) return;
		// Opened at a point: put it there, kept on screen. Phones keep the bottom sheet.
		if (at) {
			const box = panel.getBoundingClientRect();
			panel.style.position = "fixed";
			panel.style.margin = "0";
			panel.style.setProperty("position-area", "none");
			panel.style.top = `${Math.max(8, Math.min(at.y, innerHeight - box.height - 8))}px`;
			panel.style.left = `${Math.max(8, Math.min(at.x, innerWidth - box.width - 8))}px`;
			return;
		}
		const around = surround();
		if ((anchored && !around) || !trigger) return;
		const rect = trigger.getBoundingClientRect();
		const placement = props.placement ?? "bottom-start";
		panel.style.position = "fixed";
		panel.style.margin = "0";
		panel.style.setProperty("position-area", "none");
		if (around) {
			// Against the surrounding card (the composer): its bottom edge held just above the card,
			// so it stays put as its content changes, or under the card when there is more room
			// there. It scrolls inside rather than cover the card.
			panel.style.maxHeight = "";
			panel.style.top = "";
			panel.style.bottom = "";
			const edge = around.getBoundingClientRect();
			const natural = panel.getBoundingClientRect().height;
			const above = edge.top - 16;
			const below = innerHeight - edge.bottom - 16;
			const up = placement.startsWith("top")
				? natural <= above || above >= below
				: natural > below && above > below;
			if (up) {
				panel.style.top = "auto";
				panel.style.bottom = `${innerHeight - edge.top + 8}px`;
				panel.style.maxHeight = `${Math.max(120, above)}px`;
			} else {
				panel.style.top = `${edge.bottom + 8}px`;
				panel.style.maxHeight = `${Math.max(120, below)}px`;
			}
			const width = panel.getBoundingClientRect().width;
			const left = placement.endsWith("end") ? rect.right - width : rect.left;
			panel.style.left = `${Math.max(8, Math.min(left, innerWidth - width - 8))}px`;
			return;
		}
		const box = panel.getBoundingClientRect();
		const top = placement.startsWith("top") ? rect.top - box.height - 6 : rect.bottom + 6;
		const left = placement.endsWith("end") ? rect.right - box.width : rect.left;
		panel.style.top = `${Math.max(8, Math.min(top, innerHeight - box.height - 8))}px`;
		panel.style.left = `${Math.max(8, Math.min(left, innerWidth - box.width - 8))}px`;
	}

	// Measured placement follows the window as it resizes.
	createEffect(open, (isOpen) => {
		if (!isOpen) return;
		const again = () => place();
		addEventListener("resize", again);
		return () => removeEventListener("resize", again);
	});

	return (
		<>
			<button
				type="button"
				ref={(el) => {
					trigger = el;
				}}
				aria-label={props.label}
				aria-haspopup="true"
				aria-expanded={open() ? "true" : "false"}
				popovertarget={id}
				disabled={props.disabled}
				style={anchored ? `anchor-name: ${anchor}` : undefined}
				class={`${props.triggerClass} ${props.pointerOnly ? "pointer-coarse:hidden" : ""}`}
			>
				{props.trigger}
			</button>
			<div
				id={id}
				ref={(el) => {
					panel = el;
				}}
				popover="auto"
				onToggle={(event) => {
					const isOpen = (event.currentTarget as HTMLElement).matches(":popover-open");
					setOpen(isOpen);
					if (isOpen) requestAnimationFrame(place);
					else {
						at = null;
						for (const property of [
							"position",
							"margin",
							"top",
							"left",
							"position-area",
							"max-height",
							"bottom",
						])
							panel?.style.removeProperty(property);
						if (trigger && !trigger.disabled) trigger.focus();
					}
				}}
				style={anchored ? `position-anchor: ${anchor}` : undefined}
				class={`${SURFACE} ${AREA[props.placement ?? "bottom-start"]} ${props.width ?? "md:w-64"}`}
			>
				<div
					aria-hidden="true"
					class="mx-auto mt-2 mb-1 h-1 w-9 rounded-full bg-fill-strong md:hidden"
				/>
				<Show when={props.title && open()}>
					<div class="flex items-center justify-between gap-3 px-4 pt-1 pb-2 md:hidden">
						<h2 class="font-medium text-body-lg text-fg">{props.title}</h2>
						<button
							type="button"
							aria-label="Close"
							onClick={() => panel?.hidePopover?.()}
							class="surface-outline focus-ring grid size-10 shrink-0 place-items-center rounded-full text-fg-muted transition-colors duration-fast hover:text-fg"
						>
							<CloseIcon size="sm" />
						</button>
					</div>
				</Show>
				<Show when={open()}>{props.children(() => panel?.hidePopover?.())}</Show>
			</div>
		</>
	);
}
