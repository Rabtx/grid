import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

/**
 * Side-by-side and stacked layouts that people resize: a thread beside its workspace, two panes
 * one over the other. The parts own their sizing and styling so the screens using them do not.
 */

/** A region taking `share` of the space along its row or column, against its siblings' shares. */
export function SplitShare(props: {
	share: number;
	hidden?: boolean;
	/** A row of its own children (the default is a column). */
	row?: boolean;
	children: JSX.Element;
}): JSX.Element {
	return (
		<div
			hidden={props.hidden}
			class={`flex min-h-0 min-w-0 ${props.row ? "flex-row" : "flex-col"}`}
			style={{ flex: `${props.share} 1 0%` }}
		>
			{props.children}
		</div>
	);
}

/**
 * The handle between two regions: dragged with a pointer, moved with the arrow keys, its value
 * read out as a percentage. Vertical sits between columns, horizontal between rows.
 */
export function SplitHandle(props: {
	orientation: "vertical" | "horizontal";
	label: string;
	/** The leading region's share, as a whole percentage. */
	value: number;
	min: number;
	max: number;
	hidden?: boolean;
	onPointerDown: (event: PointerEvent) => void;
	onKeyDown: (event: KeyboardEvent) => void;
	/** Put it back where it started. */
	onReset?: () => void;
}): JSX.Element {
	// A focusable separator is the ARIA window-splitter pattern; the rules count every <hr> as static.
	/* oxlint-disable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions */
	return (
		<hr
			aria-orientation={props.orientation}
			aria-label={props.label}
			aria-valuemin={props.min}
			aria-valuemax={props.max}
			aria-valuenow={props.value}
			tabindex={0}
			hidden={props.hidden}
			onPointerDown={(event) => props.onPointerDown(event)}
			onKeyDown={(event) => props.onKeyDown(event)}
			onDblClick={() => props.onReset?.()}
			class={`focus-ring m-0 shrink-0 touch-none rounded-full border-0 transition-colors duration-fast hover:bg-fill-strong ${props.orientation === "vertical" ? "h-auto w-2 cursor-col-resize self-stretch" : "-my-1.5 h-2 cursor-row-resize"}`}
		/>
	);
	/* oxlint-enable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions */
}

/**
 * Where a dragged tab can be let go: a dashed outline over a pane, saying what will open there.
 * `lower` covers only the bottom half, for a split that will open below.
 */
export function SplitDropTarget(props: {
	label: string;
	hint: string;
	icon?: JSX.Element;
	lower?: boolean;
	onDrop: (event: DragEvent) => void;
}): JSX.Element {
	return (
		<div
			role="presentation"
			onDragOver={(event) => {
				event.preventDefault();
				if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
			}}
			onDrop={(event) => props.onDrop(event)}
			class={`absolute z-10 grid place-items-center rounded-kit-lg border-2 border-accent border-dashed bg-accent/8 text-center ${props.lower ? "inset-x-2 top-1/2 bottom-2" : "inset-2"}`}
		>
			<div class="flex flex-col items-center gap-1">
				<Show when={props.icon}>
					<span class="text-accent">{props.icon}</span>
				</Show>
				<span class="font-medium text-body text-accent">{props.label}</span>
				<span class="text-caption text-fg-subtle">{props.hint}</span>
			</div>
		</div>
	);
}

/** A pane docked over a phone's composer: tall enough to use, short enough to keep the thread. */
export function DockedPane(props: { children: JSX.Element }): JSX.Element {
	return <div class="mb-2 flex h-[42dvh] min-h-56 flex-col">{props.children}</div>;
}

/**
 * Another page shown in place: a dev server's preview. White underneath, since pages that set no
 * background expect it, and sandboxed to what a page under development needs.
 */
export function LivePreview(props: { title: string; src: string }): JSX.Element {
	return (
		<iframe
			title={props.title}
			src={props.src}
			class="min-h-0 w-full flex-1 border-0 bg-white"
			sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
		/>
	);
}

/** Keys a remote page is sent as keys rather than typed as text. */
const PAGE_KEYS = new Set([
	"Enter",
	"Tab",
	"Backspace",
	"Delete",
	"Escape",
	"ArrowUp",
	"ArrowDown",
	"ArrowLeft",
	"ArrowRight",
	"Home",
	"End",
	"PageUp",
	"PageDown",
]);

/**
 * A page running elsewhere (the thread's browser on its machine), shown as its latest picture and
 * usable through it: a click lands at the same spot on the page, keys go to whatever has focus
 * there, the wheel scrolls it. Points are in the page's own pixels.
 */
export function RemotePage(props: {
	title: string;
	/** The latest picture of the page; null until the first arrives. */
	src: string | null;
	onClickAt: (x: number, y: number) => void;
	onType: (text: string) => void;
	onKey: (key: string) => void;
	onScroll: (by: number) => void;
	/** Something the person did is on its way: the picture is about to change. */
	busy?: boolean;
}): JSX.Element {
	let image: HTMLImageElement | undefined;
	let wheel = 0;
	let wheelTimer: ReturnType<typeof setTimeout> | undefined;
	const point = (event: MouseEvent) => {
		if (!image?.naturalWidth) return null;
		const box = image.getBoundingClientRect();
		return {
			x: Math.round(((event.clientX - box.left) * image.naturalWidth) / box.width),
			y: Math.round(((event.clientY - box.top) * image.naturalHeight) / box.height),
		};
	};
	return (
		<button
			type="button"
			aria-label={`${props.title}: click, type and scroll to use the page`}
			class="focus-ring relative flex min-h-0 w-full flex-1 cursor-default flex-col justify-start overflow-hidden bg-white text-left"
			onClick={(event) => {
				// A click from the keyboard (Enter, Space) has no place on the page: those keys are sent.
				if (event.detail === 0) return;
				const at = point(event);
				if (at) props.onClickAt(at.x, at.y);
			}}
			onKeyUp={(event) => {
				if (event.key === " ") event.preventDefault();
			}}
			onKeyDown={(event) => {
				if (event.metaKey || event.ctrlKey || event.altKey) return;
				if (PAGE_KEYS.has(event.key)) {
					event.preventDefault();
					props.onKey(event.key);
				} else if (event.key.length === 1) {
					event.preventDefault();
					props.onType(event.key);
				}
			}}
			onWheel={(event) => {
				event.preventDefault();
				// Many small wheel steps become one scroll a moment later.
				wheel += event.deltaY;
				clearTimeout(wheelTimer);
				wheelTimer = setTimeout(() => {
					const by = Math.round(wheel);
					wheel = 0;
					if (by) props.onScroll(by);
				}, 120);
			}}
		>
			<Show when={props.src}>
				{(src) => (
					<img
						ref={(el) => {
							image = el;
						}}
						src={src()}
						alt={props.title}
						draggable={false}
						class="block h-auto w-full select-none"
					/>
				)}
			</Show>
			<Show when={props.busy}>
				<span
					class="absolute top-2 right-2 size-2 animate-pulse rounded-full bg-accent"
					aria-hidden="true"
				/>
			</Show>
		</button>
	);
}
