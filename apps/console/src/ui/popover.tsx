import type { JSX } from "@solidjs/web";
import { createSignal, createUniqueId, Show } from "solid-js";

// Phones: a bottom sheet, full width and safe-area padded, with a grabber. From md it anchors to
// its trigger — above it, since pickers live in the composer at the bottom — with a JS fallback
// where CSS anchor positioning is missing.
const SURFACE =
	"fixed inset-x-0 top-auto bottom-0 m-0 max-h-[85dvh] w-full overflow-hidden rounded-t-2xl border border-ink/10 border-b-0 bg-canvas p-0 text-ink shadow-xl pb-[env(safe-area-inset-bottom)] md:inset-auto md:max-h-[min(32rem,70dvh)] md:w-[24rem] md:rounded-xl md:border-b md:pb-0 md:[position-area:block-start_span-inline-end] md:[position-try-fallbacks:flip-block]";

function anchorPositioning(): boolean {
	return (
		typeof CSS !== "undefined" &&
		typeof CSS.supports === "function" &&
		CSS.supports("position-area: block-start")
	);
}

/**
 * A trigger that opens a panel of anything (a picker, a small form). Built on the native Popover
 * API, so tapping outside and Escape close it. The panel is only rendered while open, and gets a
 * `close` function to call after a choice.
 */
export function Popover(props: {
	label: string;
	trigger: JSX.Element;
	triggerClass: string;
	disabled?: boolean;
	children: (close: () => void) => JSX.Element;
}): JSX.Element {
	const uid = createUniqueId().replace(/[^a-zA-Z0-9_-]/g, "");
	const id = `popover-${uid}`;
	const anchorName = `--popover-${uid}`;
	const anchored = anchorPositioning();
	const [open, setOpen] = createSignal(false);
	let trigger: HTMLButtonElement | undefined;
	let panel: (HTMLDivElement & { hidePopover?: () => void }) | undefined;

	function placeWithoutAnchoring(): void {
		if (anchored || !trigger || !panel || !matchMedia("(min-width: 48rem)").matches) return;
		const rect = trigger.getBoundingClientRect();
		const height = panel.getBoundingClientRect().height;
		panel.style.position = "fixed";
		panel.style.margin = "0";
		panel.style.left = `${Math.min(rect.left, window.innerWidth - panel.offsetWidth - 8)}px`;
		panel.style.top = `${rect.top - height - 6 > 8 ? rect.top - height - 6 : rect.bottom + 6}px`;
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
				// Keep the text field's focus (and the phone keyboard) while tapping a picker.
				onPointerDown={(event) => {
					if (event.pointerType === "mouse") return;
					event.preventDefault();
				}}
				style={anchored ? `anchor-name: ${anchorName}` : undefined}
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
					if (isOpen) requestAnimationFrame(placeWithoutAnchoring);
				}}
				style={anchored ? `position-anchor: ${anchorName}` : undefined}
				class={SURFACE}
			>
				<div
					aria-hidden="true"
					class="mx-auto mt-2 mb-1 h-1 w-9 rounded-full bg-ink/20 md:hidden"
				/>
				<Show when={open()}>{props.children(() => panel?.hidePopover?.())}</Show>
			</div>
		</>
	);
}
