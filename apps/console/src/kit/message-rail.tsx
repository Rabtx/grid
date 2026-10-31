import type { JSX } from "@solidjs/web";
import { createSignal, For, onSettled, Show } from "solid-js";

/** What marks a stretch of the transcript on the rail: one per turn, named by its prompt. */
export const RAIL_MARK = "data-rail-mark";
/** The words a mark previews on hover, and names itself by for screen readers. */
export const RAIL_LABEL = "data-rail-label";

/** The shortest segment drawn, so a one-line turn in a long thread can still be found and hit. */
const MIN_SEGMENT_PX = 4;
/** The gap kept between neighbouring segments so each reads as its own turn. */
const GAP_PX = 2;

type Segment = {
	key: number;
	top: number;
	height: number;
	label: string;
	/** Some of the turn is on screen. */
	inView: boolean;
	element: HTMLElement;
};

export type MessageRailProps = {
	/** The scrolling transcript; its marks (`data-rail-mark`) become the rail's segments. */
	scroller: () => HTMLElement | undefined;
	/** Layout only. */
	class?: string;
};

/** Words for a preview: one line, cut at a word near `max` characters. */
function preview(text: string, max = 90): string {
	const line = text.replace(/\s+/g, " ").trim();
	if (line.length <= max) return line;
	const cut = line.slice(0, max);
	return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20))}…`;
}

/**
 * The transcript's message rail, in place of a scrollbar: down the right edge, one segment per
 * turn, placed and sized where that turn sits in the thread, so the shape of the conversation is
 * visible at a glance. Turns on screen are drawn in ink; the rest are faint. Resting on a segment
 * shows its prompt (the app-wide tooltip); clicking one, or pressing it from the keyboard, scrolls
 * to that turn. Clicking between segments jumps to that point. It follows the transcript as it
 * grows, streams and loads earlier messages, and hides when everything fits. Pointers only: on
 * touch the thread scrolls under the thumb.
 */
export function MessageRail(props: MessageRailProps): JSX.Element {
	let rail: HTMLElement | undefined;
	const [segments, setSegments] = createSignal<Segment[]>([]);
	const [scrollable, setScrollable] = createSignal(false);
	const [awake, setAwake] = createSignal(false);
	let frame = 0;
	let idle: ReturnType<typeof setTimeout> | undefined;

	function measure(): void {
		frame = 0;
		const scroller = props.scroller();
		if (!scroller || !rail) return;
		const { scrollTop, scrollHeight, clientHeight } = scroller;
		const height = rail.clientHeight;
		const fits = scrollHeight - clientHeight <= 4 || height <= 0;
		setScrollable(!fits);
		if (fits) {
			setSegments([]);
			return;
		}
		const origin = scroller.getBoundingClientRect().top - scrollTop;
		const scale = height / scrollHeight;
		const marks = [...scroller.querySelectorAll<HTMLElement>(`[${RAIL_MARK}]`)];
		const next: Segment[] = [];
		marks.forEach((element, key) => {
			const box = element.getBoundingClientRect();
			const top = box.top - origin;
			const bottom = top + box.height;
			const drawnTop = Math.max(0, top * scale);
			const drawnBottom = Math.min(height, bottom * scale - GAP_PX);
			next.push({
				key,
				top: drawnTop,
				height: Math.max(MIN_SEGMENT_PX, drawnBottom - drawnTop),
				label: preview(element.getAttribute(RAIL_LABEL) ?? ""),
				inView: bottom > scrollTop && top < scrollTop + clientHeight,
				element,
			});
		});
		setSegments(next);
	}

	function schedule(): void {
		if (!frame) frame = requestAnimationFrame(measure);
	}

	function wake(): void {
		setAwake(true);
		if (idle) clearTimeout(idle);
		idle = setTimeout(() => setAwake(false), 1400);
	}

	onSettled(() => {
		const scroller = props.scroller();
		if (!scroller) return;
		const onScroll = () => {
			schedule();
			wake();
		};
		scroller.addEventListener("scroll", onScroll, { passive: true });
		// The transcript grows, streams and loads earlier turns: remeasure whenever it changes.
		const resize = new ResizeObserver(schedule);
		resize.observe(scroller);
		if (scroller.firstElementChild) resize.observe(scroller.firstElementChild);
		const mutations = new MutationObserver(schedule);
		mutations.observe(scroller, { childList: true, subtree: true });
		schedule();
		return () => {
			scroller.removeEventListener("scroll", onScroll);
			resize.disconnect();
			mutations.disconnect();
			if (frame) cancelAnimationFrame(frame);
			if (idle) clearTimeout(idle);
		};
	});

	function jumpTo(segment: Segment): void {
		segment.element.scrollIntoView({ block: "start", behavior: "smooth" });
	}

	/** A click between segments lands on that point of the thread, centred. */
	function jumpToPoint(event: MouseEvent): void {
		const scroller = props.scroller();
		if (!scroller || !rail || event.target !== rail) return;
		const box = rail.getBoundingClientRect();
		const ratio = (event.clientY - box.top) / Math.max(1, box.height);
		scroller.scrollTo({
			top: ratio * scroller.scrollHeight - scroller.clientHeight / 2,
			behavior: "smooth",
		});
	}

	return (
		// oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- the segments are the keyboard path; a click between them is a pointer shortcut
		<nav
			ref={(el) => {
				rail = el;
			}}
			aria-label="Messages"
			onClick={jumpToPoint}
			class={`group/rail absolute top-3 right-1 bottom-3 z-20 w-4 transition-opacity duration-base ease-out-grid pointer-coarse:hidden ${scrollable() ? "" : "pointer-events-none opacity-0"} ${scrollable() && !awake() ? "opacity-60 hover:opacity-100" : ""} ${props.class ?? ""}`}
		>
			<Show when={scrollable()}>
				{/* keyed={false}: segments are remeasured every frame; each button keeps its DOM. */}
				<For each={segments()} keyed={false}>
					{(segment) => (
						<button
							type="button"
							aria-label={`Go to: ${segment().label || "this turn"}`}
							data-tooltip={segment().label || "This turn"}
							onClick={() => jumpTo(segment())}
							class="focus-ring group/mark absolute right-0 flex w-4 justify-end"
							style={{ top: `${segment().top}px`, height: `${segment().height}px` }}
						>
							<span
								class={`h-full rounded-full transition-[width,background-color] duration-fast ease-out-grid group-hover/mark:w-1.5 group-hover/mark:bg-fg group-focus-visible/mark:bg-fg ${segment().inView ? "w-1 bg-fg-muted" : "w-0.5 bg-fg-faint"}`}
							/>
						</button>
					)}
				</For>
			</Show>
		</nav>
	);
}
