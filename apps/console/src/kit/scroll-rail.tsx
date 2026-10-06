import type { JSX } from "@solidjs/web";
import { createSignal, onSettled, Show } from "solid-js";

/** Minimum height in pixels so the grill thumb remains easily grabbable. */
const MIN_THUMB_PX = 36;

export type ScrollRailProps = {
	scroller: () => HTMLElement | undefined;
	class?: string;
};

/**
 * A tactile scroll rail ("grills") for chat conversations and scrollable surfaces:
 * - Hidden native scrollbars replaced by an aesthetic, slim rail.
 * - Smooth draggable thumb with centered grip grill ridges.
 * - Clicking the rail jumps to that position in the transcript.
 * - Auto-fades to subtle when idle; lights up on scroll or hover.
 */
export function ScrollRail(props: ScrollRailProps): JSX.Element {
	let track: HTMLDivElement | undefined;
	let thumb: HTMLDivElement | undefined;

	const [visible, setVisible] = createSignal(false);
	const [active, setActive] = createSignal(false);
	const [thumbTop, setThumbTop] = createSignal(0);
	const [thumbHeight, setThumbHeight] = createSignal(MIN_THUMB_PX);
	const [dragging, setDragging] = createSignal(false);

	let idleTimer: ReturnType<typeof setTimeout> | undefined;

	function pulseActive(): void {
		setActive(true);
		if (idleTimer) clearTimeout(idleTimer);
		idleTimer = setTimeout(() => {
			if (!dragging()) setActive(false);
		}, 1400);
	}

	function update(): void {
		const el = props.scroller();
		if (!el) {
			setVisible(false);
			return;
		}

		const { scrollTop, scrollHeight, clientHeight } = el;
		const maxScroll = scrollHeight - clientHeight;

		if (maxScroll <= 4 || clientHeight <= 0) {
			setVisible(false);
			return;
		}

		setVisible(true);
		const trackH = track && track.clientHeight > 0 ? track.clientHeight : clientHeight;
		const computedHeight = Math.max(
			MIN_THUMB_PX,
			Math.min(trackH, (trackH * clientHeight) / scrollHeight),
		);
		const travel = Math.max(0, trackH - computedHeight);
		const progress = Math.min(1, Math.max(0, scrollTop / maxScroll));
		const top = travel * progress;

		setThumbHeight(computedHeight);
		setThumbTop(top);
	}

	onSettled(() => {
		const el = props.scroller();
		if (!el) return;

		const handleScroll = () => {
			update();
			pulseActive();
		};

		el.addEventListener("scroll", handleScroll, { passive: true });
		window.addEventListener("resize", update);

		// Initial geometry measurement
		update();

		return () => {
			el.removeEventListener("scroll", handleScroll);
			window.removeEventListener("resize", update);
			if (idleTimer) clearTimeout(idleTimer);
		};
	});

	function handlePointerDown(event: PointerEvent): void {
		const el = props.scroller();
		const trackEl = track;
		if (!el || !trackEl) return;

		event.preventDefault();
		const target = event.target as HTMLElement;

		if (thumb && (target === thumb || thumb.contains(target))) {
			// Dragging the grill thumb directly
			setDragging(true);
			setActive(true);
			thumb.setPointerCapture(event.pointerId);

			const startY = event.clientY;
			const initialTop = thumbTop();
			const trackH = trackEl.clientHeight;
			const travel = Math.max(0, trackH - thumbHeight());
			const maxScroll = el.scrollHeight - el.clientHeight;

			const onPointerMove = (moveEvent: PointerEvent) => {
				if (travel <= 0 || maxScroll <= 0) return;
				const deltaY = moveEvent.clientY - startY;
				const nextTop = Math.max(0, Math.min(travel, initialTop + deltaY));
				setThumbTop(nextTop);
				el.scrollTop = (nextTop / travel) * maxScroll;
			};

			const onPointerUp = (upEvent: PointerEvent) => {
				setDragging(false);
				pulseActive();
				thumb?.releasePointerCapture(upEvent.pointerId);
				window.removeEventListener("pointermove", onPointerMove);
				window.removeEventListener("pointerup", onPointerUp);
			};

			window.addEventListener("pointermove", onPointerMove);
			window.addEventListener("pointerup", onPointerUp);
		} else {
			// Clicked on the track: jump directly to the target location
			const rect = trackEl.getBoundingClientRect();
			const clickY = event.clientY - rect.top;
			const trackH = trackEl.clientHeight;
			const targetTop = Math.max(0, Math.min(trackH - thumbHeight(), clickY - thumbHeight() / 2));
			const travel = Math.max(0, trackH - thumbHeight());
			const maxScroll = el.scrollHeight - el.clientHeight;

			if (travel > 0 && maxScroll > 0) {
				el.scrollTop = (targetTop / travel) * maxScroll;
				setThumbTop(targetTop);
			}
			pulseActive();
		}
	}

	return (
		<Show when={visible()}>
			<div
				ref={(el) => {
					track = el;
				}}
				onPointerDown={handlePointerDown}
				onPointerEnter={() => setActive(true)}
				onPointerLeave={() => {
					if (!dragging()) pulseActive();
				}}
				class={`group absolute top-2 bottom-2 right-1 z-20 flex w-3.5 select-none justify-center touch-none transition-opacity duration-base ${
					active() || dragging() ? "opacity-100" : "opacity-30 hover:opacity-100"
				} ${props.class ?? ""}`}
				aria-hidden="true"
			>
				{/* The grill thumb with centered grip ridges */}
				<div
					ref={(el) => {
						thumb = el;
					}}
					style={{
						top: `${thumbTop()}px`,
						height: `${thumbHeight()}px`,
					}}
					class={`group/thumb absolute w-1.5 cursor-grab rounded-full bg-fg-muted/40 transition-[width,background-color] duration-fast hover:w-2 hover:bg-fg-muted/70 active:w-2.5 active:cursor-grabbing active:bg-fg ${
						dragging() ? "w-2.5 bg-fg" : ""
					}`}
				>
					{/* Centered tactile grill ridges */}
					<div class="pointer-events-none flex h-full w-full flex-col items-center justify-center gap-0.5">
						<span class="h-0.5 w-1 rounded-full bg-surface/80" />
						<span class="h-0.5 w-1 rounded-full bg-surface/80" />
						<span class="h-0.5 w-1 rounded-full bg-surface/80" />
					</div>
				</div>
			</div>
		</Show>
	);
}
