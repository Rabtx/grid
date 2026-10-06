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
