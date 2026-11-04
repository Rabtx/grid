import type { JSX } from "@solidjs/web";

/** Where a pane sits in its layer, in percentages of the layer. */
export type PaneRect = { x: number; y: number; w: number; h: number };

/**
 * A pane placed by percentages inside a layer: the panes of a split laid over one another, so what
 * is in them (a live terminal) is never moved in the page and never restarts when the split
 * changes. `framed` draws the pane's own edge for a split; `lit` marks the one in focus.
 */
export function PaneBox(props: {
	rect: PaneRect;
	hidden?: boolean;
	framed?: boolean;
	lit?: boolean;
	onFocusIn?: () => void;
	children: JSX.Element;
}): JSX.Element {
	return (
		<div
			hidden={props.hidden}
			onPointerDown={() => props.onFocusIn?.()}
			class={`absolute flex flex-col overflow-hidden ${props.framed ? `border transition-colors duration-fast ${props.lit ? "border-terminal-dim/45" : "border-terminal-dim/15"}` : ""}`}
			style={{
				left: `${props.rect.x}%`,
				top: `${props.rect.y}%`,
				width: `${props.rect.w}%`,
				height: `${props.rect.h}%`,
			}}
		>
			{props.children}
		</div>
	);
}

/**
 * The line between two panes of a split, at `at` percent across (columns) or down (rows), dragged
 * to resize them. It reports where the pointer is, as a percentage of the layer, and stays out of
 * the way otherwise: a hairline that thickens under the pointer.
 */
export function PaneDivider(props: {
	direction: "row" | "column";
	at: number;
	label: string;
	onDrag: (percent: number) => void;
	onReset?: () => void;
}): JSX.Element {
	const across = () => props.direction === "row";
	// A focusable separator is the ARIA window-splitter pattern; an <hr> cannot hold the line.
	/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-interactions */
	return (
		<div
			role="separator"
			tabindex={0}
			onKeyDown={(event) => {
				const back = across() ? "ArrowLeft" : "ArrowUp";
				const on = across() ? "ArrowRight" : "ArrowDown";
				if (event.key !== back && event.key !== on) return;
				event.preventDefault();
				props.onDrag(props.at + (event.key === on ? 2 : -2));
			}}
			aria-label={props.label}
			aria-orientation={across() ? "vertical" : "horizontal"}
			aria-valuenow={Math.round(props.at)}
			class={`group focus-ring absolute z-10 flex touch-none items-center justify-center ${across() ? "top-0 bottom-0 w-2 -translate-x-1 cursor-col-resize" : "right-0 left-0 h-2 -translate-y-1 cursor-row-resize"}`}
			style={across() ? { left: `${props.at}%` } : { top: `${props.at}%` }}
			onDblClick={() => props.onReset?.()}
			onPointerDown={(event) => {
				const layer = (event.currentTarget as HTMLElement).parentElement;
				if (!layer) return;
				event.preventDefault();
				const box = layer.getBoundingClientRect();
				const target = event.currentTarget as HTMLElement;
				target.setPointerCapture(event.pointerId);
				const move = (next: PointerEvent) =>
					props.onDrag(
						across()
							? ((next.clientX - box.left) / box.width) * 100
							: ((next.clientY - box.top) / box.height) * 100,
					);
				const stop = () => {
					target.removeEventListener("pointermove", move);
					target.removeEventListener("pointerup", stop);
					target.removeEventListener("pointercancel", stop);
				};
				target.addEventListener("pointermove", move);
				target.addEventListener("pointerup", stop);
				target.addEventListener("pointercancel", stop);
			}}
		>
			<span
				class={`bg-terminal-dim/20 transition-colors duration-fast group-hover:bg-accent group-active:bg-accent ${across() ? "h-full w-px" : "h-px w-full"}`}
			/>
		</div>
	);
	/* oxlint-enable jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-interactions */
}
