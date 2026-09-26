import type { JSX } from "@solidjs/web";
import { createSignal, createUniqueId, Show } from "solid-js";

export type Placement = "bottom-start" | "bottom-end" | "top-start" | "top-end";

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
	children: (close: () => void) => JSX.Element;
}): JSX.Element {
	const uid = createUniqueId().replace(/[^a-zA-Z0-9_-]/g, "");
	const id = `kit-popover-${uid}`;
	const anchor = `--kit-anchor-${uid}`;
	const anchored = anchoring();
	const [open, setOpen] = createSignal(false);
	let trigger: HTMLButtonElement | undefined;
	let panel: (HTMLDivElement & { hidePopover?: () => void }) | undefined;

	function place(): void {
		if (anchored || !trigger || !panel || !matchMedia("(min-width: 48rem)").matches) return;
		const rect = trigger.getBoundingClientRect();
		const box = panel.getBoundingClientRect();
		const placement = props.placement ?? "bottom-start";
		const top = placement.startsWith("top") ? rect.top - box.height - 6 : rect.bottom + 6;
		const left = placement.endsWith("end") ? rect.right - box.width : rect.left;
		panel.style.position = "fixed";
		panel.style.margin = "0";
		panel.style.top = `${Math.max(8, Math.min(top, innerHeight - box.height - 8))}px`;
		panel.style.left = `${Math.max(8, Math.min(left, innerWidth - box.width - 8))}px`;
	}

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
				class={props.triggerClass}
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
				}}
				style={anchored ? `position-anchor: ${anchor}` : undefined}
				class={`${SURFACE} ${AREA[props.placement ?? "bottom-start"]} ${props.width ?? "md:w-64"}`}
			>
				<div
					aria-hidden="true"
					class="mx-auto mt-2 mb-1 h-1 w-9 rounded-full bg-fill-strong md:hidden"
				/>
				<Show when={open()}>{props.children(() => panel?.hidePopover?.())}</Show>
			</div>
		</>
	);
}
