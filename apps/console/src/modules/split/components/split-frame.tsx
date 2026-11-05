import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, Show } from "solid-js";

import { SplitHandle, SplitShare } from "@/kit";
import { useCommand } from "@/lib/keybindings";

import { clampRatio, RATIO, toggleZoom } from "../lib/layout";
import { layoutsStore } from "../stores/layouts";

import { SplitPicker, toggleSplit } from "./split-switch";
import { Workspace, type WorkspaceProps } from "./workspace";

/**
 * The thread beside its workspace on desktop, after the split in the video it is modelled on: each
 * side a card of its own with a slim gap, a handle in the gap to drag, the workspace sliding in as
 * it opens. Maximized, the workspace fills the frame and the thread steps aside. In Focus the
 * workspace is hidden, not unmounted, once it has been opened, so coming back finds the terminal
 * still connected. ⌘\ opens (asking what) or shuts it; ⌘⇧↵ maximizes or restores.
 */
export function SplitFrame(
	props: WorkspaceProps & {
		/** The thread itself: its transcript and composer. */
		children: JSX.Element;
		/** Desktop-wide: phones keep the thread full width and dock the workspace instead. */
		wide: boolean;
	},
): JSX.Element {
	const thread = () => props.place.thread;
	const layout = () => layoutsStore.of(thread());
	const open = () => props.wide && layout().mode !== "focus";
	const zoomed = () => open() && layout().zoomed === true;
	useCommand("split.toggle", () => {
		if (!props.wide) return false;
		toggleSplit(thread());
	});
	useCommand("split.zoom", () => {
		if (!open()) return false;
		layoutsStore.update(thread(), toggleZoom);
	});
	const [visited, setVisited] = createSignal(false);
	createEffect(open, (value) => {
		if (value) setVisited(true);
	});
	let frame: HTMLDivElement | undefined;

	function dragRatio(event: PointerEvent): void {
		if (!frame) return;
		const box = frame.getBoundingClientRect();
		const handle = event.currentTarget as HTMLElement;
		handle.setPointerCapture(event.pointerId);
		const move = (next: PointerEvent) =>
			layoutsStore.preview(thread(), (current) => ({
				...current,
				ratio: clampRatio((next.clientX - box.left) / box.width),
			}));
		const end = () => {
			handle.removeEventListener("pointermove", move);
			handle.removeEventListener("pointerup", end);
			handle.removeEventListener("pointercancel", end);
			layoutsStore.save(thread());
		};
		handle.addEventListener("pointermove", move);
		handle.addEventListener("pointerup", end);
		handle.addEventListener("pointercancel", end);
	}

	return (
		<div
			ref={(el) => {
				frame = el;
			}}
			class={`flex min-h-0 min-w-0 flex-1 ${open() ? "gap-1 p-2" : ""}`}
		>
			<SplitShare share={open() ? layout().ratio : 1} card={open()} hidden={zoomed()}>
				{props.children}
			</SplitShare>
			<Show when={visited() && props.wide}>
				<SplitHandle
					orientation="vertical"
					label="Resize the thread and its workspace"
					value={Math.round(layout().ratio * 100)}
					min={Math.round(RATIO.min * 100)}
					max={Math.round(RATIO.max * 100)}
					hidden={!open() || zoomed()}
					onPointerDown={dragRatio}
					onReset={() =>
						layoutsStore.update(thread(), (current) => ({ ...current, ratio: RATIO.initial }))
					}
					onKeyDown={(event) => {
						const step = event.key === "ArrowLeft" ? -0.03 : event.key === "ArrowRight" ? 0.03 : 0;
						if (!step) return;
						event.preventDefault();
						layoutsStore.update(thread(), (current) => ({
							...current,
							ratio: clampRatio(current.ratio + step),
						}));
					}}
				/>
				{/* The slide-in replays each time it is shown again: hidden takes it out of the page. */}
				<SplitShare share={zoomed() ? 1 : 1 - layout().ratio} hidden={!open()} row enter="side">
					<Workspace {...props} />
				</SplitShare>
			</Show>
			<Show when={props.wide}>
				<SplitPicker {...props} />
			</Show>
		</div>
	);
}
