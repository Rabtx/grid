import type { JSX } from "@solidjs/web";
import { createSignal, For, onSettled, Show } from "solid-js";

import { ChevronDownIcon, ChevronUpIcon } from "./icons";

/**
 * The transcript's minimap, ported from T3 Code's timeline minimap (MIT, © T3 Tools Inc.): a
 * column of short strips in the left gutter, one per message you sent, evenly spaced and
 * centred, so a long thread reads as a ladder you can scan and jump along.
 *
 * Strips for messages on screen are drawn in ink; the rest are faint. Pointing at the ladder
 * lifts the strip under the pointer to full width with its neighbours tapering away (a fisheye),
 * and shows that message and the start of its reply in a card beside it. Clicking jumps there;
 * the arrows above and below step to the previous and next message; the wheel over it scrolls the
 * thread; from the keyboard, arrows, Home and End move and Enter jumps.
 *
 * It sits in the thread's gutter. Where the gutter is wide enough (48px either side of the
 * column) it stays shown; otherwise it appears on hover. Pointers only: on touch the thread
 * scrolls under the thumb, and it hides with fewer than two messages.
 */

/** What marks a message on the minimap: one per turn you started. */
export const MINIMAP_MARK = "data-minimap-mark";
/** The message, as the preview shows it. */
export const MINIMAP_PROMPT = "data-minimap-prompt";
/** The turn's final reply, as the preview's second part shows it. */
export const MINIMAP_REPLY = "data-minimap-reply";

/** Fewer messages than this and there is nothing to navigate. */
const MIN_ITEMS = 2;
/** The distance between strips, px. */
const SPACING = 8;
/** The ladder never grows taller than this; past it the strips close up. */
const MAX_HEIGHT = "calc(100vh - 18rem)";
/** A gutter this wide (px, each side of the column) keeps the ladder shown. */
const PERSISTENT_GUTTER = 48;
/** Where the hit strip starts in the gutter, and its widest, px. */
const HIT_LEFT = 12;
const HIT_MAX = 40;
/** The arrows need this much gutter (px) to be reachable. */
const NAV_REACH = 14;
/** How long the preview may run before it is cut, characters. */
const PREVIEW_LIMIT = 1_500;
/** Strip widths by distance from the one pointed at: the fisheye. */
const FISHEYE = ["scale-x-100", "scale-x-[0.667]", "scale-x-[0.417]"] as const;

type Item = {
	element: HTMLElement;
	/** Some of the message's turn is on screen. */
	inView: boolean;
};

function compact(text: string | null | undefined): string | null {
	const line = text?.replace(/\s+/g, " ").trim() ?? "";
	return line.length > 0 ? line : null;
}

/** Markdown as one line of plain words, for the reply's preview. */
function plain(markdown: string): string {
	return markdown
		.slice(0, PREVIEW_LIMIT)
		.replace(/```[\s\S]*?(```|$)/g, " ")
		.replace(/<[^>]+>/g, " ")
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/^[ \t]*(?:#{1,6}|>|[-*+]|\d+\.)[ \t]+/gm, "")
		.replace(/`+|\*\*|__|~~/g, "")
		.replace(/(^|[^\w*])[*_]([^*_\n]+)[*_](?![\w*])/g, "$1$2");
}

function topPercent(index: number, count: number): number {
	if (count <= 1) return 0;
	return (Math.max(0, Math.min(index, count - 1)) / (count - 1)) * 100;
}

export function TimelineMinimap(props: {
	/** The scrolling thread; its marks (`data-minimap-mark`) become the strips. */
	scroller: () => HTMLElement | undefined;
}): JSX.Element {
	const [items, setItems] = createSignal<Item[]>([]);
	const [current, setCurrent] = createSignal<number | null>(null);
	const [active, setActive] = createSignal<number | null>(null);
	const [persistent, setPersistent] = createSignal(false);
	const [hitWidth, setHitWidth] = createSignal(0);
	let frame = 0;

	function measure(): void {
		frame = 0;
		const scroller = props.scroller();
		if (!scroller) return;
		const marks = [...scroller.querySelectorAll<HTMLElement>(`[${MINIMAP_MARK}]`)];
		const view = scroller.getBoundingClientRect();
		const next = marks.map((element) => {
			const box = element.getBoundingClientRect();
			return { element, inView: box.bottom > view.top && box.top < view.bottom };
		});
		const before = items();
		const same =
			before.length === next.length &&
			before.every(
				(item, index) =>
					item.element === next[index]?.element && item.inView === next[index]?.inView,
			);
		if (!same) setItems(next);
		// The message being read: the first one on screen, or the one whose turn is.
		let reading: number | null = null;
		for (const [index, item] of next.entries()) {
			const box = item.element.getBoundingClientRect();
			if (box.top >= view.top) {
				reading = box.top <= view.bottom ? index : reading;
				break;
			}
			reading = index;
		}
		setCurrent(reading);
		// The gutter: the room either side of the thread's column.
		const column = marks[0]?.getBoundingClientRect().width ?? view.width;
		const gutter = Math.max(0, (view.width - column) / 2);
		setPersistent(gutter >= PERSISTENT_GUTTER);
		setHitWidth(Math.max(0, Math.min(HIT_MAX, Math.floor(gutter) - HIT_LEFT)));
	}

	function schedule(): void {
		if (!frame) frame = requestAnimationFrame(measure);
	}

	onSettled(() => {
		const scroller = props.scroller();
		if (!scroller) return;
		scroller.addEventListener("scroll", schedule, { passive: true });
		// The thread grows, streams and loads earlier turns: remeasure whenever it changes.
		const resize = new ResizeObserver(schedule);
		resize.observe(scroller);
		if (scroller.firstElementChild) resize.observe(scroller.firstElementChild);
		const mutations = new MutationObserver(schedule);
		mutations.observe(scroller, { childList: true, subtree: true });
		schedule();
		return () => {
			scroller.removeEventListener("scroll", schedule);
			resize.disconnect();
			mutations.disconnect();
			if (frame) cancelAnimationFrame(frame);
		};
	});

	const count = () => items().length;
	const activeItem = () => {
		const index = active();
		const item = index === null ? undefined : items()[index];
		if (!item) return null;
		const reply = item.element.getAttribute(MINIMAP_REPLY);
		return {
			prompt: compact(item.element.getAttribute(MINIMAP_PROMPT)) ?? "Your message",
			reply: compact(reply ? plain(reply) : null),
		};
	};
	const navigable = () => hitWidth() >= NAV_REACH;

	function jump(index: number | null): void {
		const item = index === null ? undefined : items()[index];
		item?.element.scrollIntoView({ block: "start", behavior: "smooth" });
	}

	function indexAt(event: MouseEvent): number | null {
		const target = event.currentTarget as HTMLElement;
		const box = target.getBoundingClientRect();
		const n = count();
		if (n <= 0 || box.height <= 0) return null;
		if (n === 1) return 0;
		const progress = Math.max(0, Math.min(1, (event.clientY - box.top) / box.height));
		return Math.round(progress * (n - 1));
	}

	function step(delta: number): void {
		setActive((now) => Math.max(0, Math.min(count() - 1, (now ?? 0) + delta)));
	}

	/** The wheel over the ladder scrolls the thread, not the page around it. */
	function forwardWheel(event: WheelEvent): void {
		const scroller = props.scroller();
		if (!scroller) return;
		event.preventDefault();
		scroller.scrollBy({ top: event.deltaY, left: 0 });
	}

	const fromPreview = (event: Event) =>
		event.target instanceof Element && event.target.closest("[data-minimap-preview]") !== null;

	return (
		<Show when={count() >= MIN_ITEMS}>
			<div
				ref={(el) => {
					el.addEventListener("wheel", forwardWheel, { passive: false });
				}}
				data-persistent-gutter={persistent() ? "true" : "false"}
				class={`group/minimap pointer-events-none absolute inset-y-0 left-0 z-30 hidden w-18 pointer-fine:block ${persistent() ? "opacity-100" : "opacity-0 transition-opacity duration-fast hover:opacity-100 focus-within:opacity-100"}`}
			>
				<div class="relative h-full w-full select-none">
					<div
						class={`absolute top-1/2 left-3 -translate-y-1/2 ${hitWidth() > 0 ? "pointer-events-auto" : "pointer-events-none"}`}
						style={{
							height: `min(${Math.max(1, (count() - 1) * SPACING)}px, ${MAX_HEIGHT})`,
							width: activeItem() ? "22rem" : `${hitWidth()}px`,
						}}
					>
						<Step
							direction="previous"
							disabled={(current() ?? 0) <= 0}
							reachable={navigable()}
							onClick={() => jump((current() ?? 0) - 1)}
						/>
						<button
							type="button"
							aria-label={`Jump to message: ${activeItem()?.prompt ?? "Your message"}`}
							class="absolute inset-y-0 left-0 w-full cursor-pointer bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-inset"
							onBlur={() => setActive(null)}
							onFocus={() => setActive((now) => now ?? current() ?? 0)}
							onMouseLeave={() => setActive(null)}
							onMouseMove={(event) => setActive(indexAt(event))}
							onMouseDown={(event) => {
								if (!fromPreview(event)) event.preventDefault();
							}}
							onClick={(event) => {
								if (fromPreview(event)) return;
								jump(indexAt(event));
								event.currentTarget.blur();
							}}
							onKeyDown={(event) => {
								const keys: Record<string, () => void> = {
									ArrowDown: () => step(1),
									ArrowUp: () => step(-1),
									Home: () => setActive(0),
									End: () => setActive(count() - 1),
									Enter: () => jump(active()),
									" ": () => jump(active()),
								};
								const run = keys[event.key];
								if (!run) return;
								event.preventDefault();
								run();
							}}
						>
							<span class="absolute top-0 left-3 h-full w-px bg-line" />
							<For each={items()} keyed={false}>
								{(item, index) => {
									const distance = () => {
										const at = active();
										return at === null ? null : Math.abs(index - at);
									};
									return (
										// Only transform and opacity move: every scroll tick and streamed word can
										// flip a band of strips, so they stay on the compositor.
										<span
											aria-hidden="true"
											data-in-view={item().inView ? "true" : "false"}
											class={`pointer-events-none absolute left-0 h-0.5 w-6 origin-left -translate-y-1/2 rounded-full transition-transform duration-fast after:absolute after:inset-0 after:rounded-full after:bg-fg/55 after:opacity-0 after:transition-opacity after:duration-fast data-[in-view=true]:after:opacity-100 ${distance() === 0 ? "bg-fg-subtle" : "bg-fg-faint/60"} ${FISHEYE[distance() ?? 3] ?? "scale-x-[0.333]"}`}
											style={{ top: `${topPercent(index, count())}%` }}
										/>
									);
								}}
							</For>
							<Show when={activeItem()}>
								{(preview) => (
									<span
										data-minimap-preview
										class="pointer-events-auto absolute left-8 w-80 cursor-text select-text"
										onMouseMove={(event) => event.stopPropagation()}
										style={{
											top: `${topPercent(active() ?? 0, count())}%`,
											transform: `translateY(${active() === 0 ? "0%" : active() === count() - 1 ? "-100%" : "-50%"})`,
										}}
									>
										<span class="block rounded-kit-xl bg-surface-raised p-3 text-left text-fg shadow-float">
											<span class="block truncate font-medium text-body leading-5">
												{preview().prompt}
											</span>
											<Show when={preview().reply}>
												<span class="mt-1 line-clamp-3 text-body text-fg-muted leading-5">
													{preview().reply}
												</span>
											</Show>
										</span>
									</span>
								)}
							</Show>
						</button>
						<Step
							direction="next"
							disabled={current() === null || (current() ?? 0) >= count() - 1}
							reachable={navigable()}
							onClick={() => jump((current() ?? -1) + 1)}
						/>
					</div>
				</div>
			</div>
		</Show>
	);
}

/** The arrow above or below the ladder: to the previous or next message. */
function Step(props: {
	direction: "previous" | "next";
	disabled: boolean;
	reachable: boolean;
	onClick: () => void;
}): JSX.Element {
	const previous = () => props.direction === "previous";
	const label = () => (previous() ? "Previous message" : "Next message");
	return (
		<span
			class={`absolute left-1 z-10 inline-flex -translate-x-1/2 opacity-0 transition-opacity duration-fast hover:opacity-100 focus-within:opacity-100 ${props.reachable ? "pointer-events-auto" : "pointer-events-none"} ${previous() ? "bottom-[calc(100%+2px)]" : "top-[calc(100%+2px)]"}`}
		>
			<button
				type="button"
				aria-label={label()}
				data-tooltip={label()}
				disabled={props.disabled}
				onClick={() => props.onClick()}
				class="focus-ring grid size-5 place-items-center rounded-tile text-fg-muted transition-colors duration-fast hover:bg-fill-strong hover:text-fg disabled:opacity-40"
			>
				<Show when={previous()} fallback={<ChevronDownIcon />}>
					<ChevronUpIcon />
				</Show>
			</button>
		</span>
	);
}
