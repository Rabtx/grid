import type { JSX } from "@solidjs/web";
import { createSignal, onSettled, Show } from "solid-js";

import { shortcutKeys } from "./keys";

type Tip = { text: string; shortcut?: string; x: number; top: number; bottom: number };

const DELAY_MS = 450;
const GAP = 6;
const EDGE = 8;

/**
 * The one tooltip for the whole console, for pointers: resting on anything marked
 * `data-tooltip` (every icon button) shows its name — and `data-shortcut`, when it has one — in a
 * small bubble under it, or over it when there is no room below, always kept on screen. It is
 * fixed to the viewport, so no scrolling panel or screen edge clips it. Touch screens have no
 * hover, so they never see it; the buttons' labels still name them for screen readers.
 */
export function TooltipLayer(): JSX.Element {
	const [tip, setTip] = createSignal<Tip | null>(null);

	onSettled(() => {
		if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;
		let target: HTMLElement | null = null;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const hide = () => {
			clearTimeout(timer);
			target = null;
			setTip(null);
		};
		const over = (event: PointerEvent) => {
			const found =
				(event.target as Element | null)?.closest<HTMLElement>("[data-tooltip]") ?? null;
			if (found === target) return;
			hide();
			target = found;
			if (!found) return;
			timer = setTimeout(() => {
				const text = found.dataset.tooltip;
				if (!text || !found.isConnected) return;
				const rect = found.getBoundingClientRect();
				setTip({
					text,
					shortcut: found.dataset.shortcut
						? shortcutKeys(found.dataset.shortcut).join(" ")
						: undefined,
					x: rect.left + rect.width / 2,
					top: rect.top,
					bottom: rect.bottom,
				});
			}, DELAY_MS);
		};
		document.addEventListener("pointerover", over);
		document.addEventListener("pointerdown", hide, true);
		document.addEventListener("keydown", hide, true);
		window.addEventListener("scroll", hide, true);
		window.addEventListener("blur", hide);
		return () => {
			hide();
			document.removeEventListener("pointerover", over);
			document.removeEventListener("pointerdown", hide, true);
			document.removeEventListener("keydown", hide, true);
			window.removeEventListener("scroll", hide, true);
			window.removeEventListener("blur", hide);
		};
	});

	/** Place the bubble once its size is known: centred, below if it fits, never off screen. */
	function place(el: HTMLDivElement, at: Tip): void {
		const width = el.offsetWidth;
		const height = el.offsetHeight;
		const below = at.bottom + GAP + height <= window.innerHeight - EDGE;
		const left = Math.min(Math.max(at.x - width / 2, EDGE), window.innerWidth - width - EDGE);
		el.style.left = `${left}px`;
		el.style.top = `${below ? at.bottom + GAP : at.top - GAP - height}px`;
		el.style.visibility = "visible";
	}

	return (
		<Show when={tip()} keyed>
			{(at) => (
				<div
					ref={(el) => queueMicrotask(() => place(el, at))}
					aria-hidden="true"
					style={{ visibility: "hidden" }}
					class="pointer-events-none fixed top-0 left-0 z-[100] flex items-center gap-1.5 whitespace-nowrap rounded-kit bg-inverse px-2 py-1 text-caption text-inverse-fg shadow-float"
				>
					{at.text}
					<Show when={at.shortcut}>
						<span class="rounded-kit-xs bg-inverse-fg/15 px-1 font-kit tabular-nums opacity-80">
							{at.shortcut}
						</span>
					</Show>
				</div>
			)}
		</Show>
	);
}
