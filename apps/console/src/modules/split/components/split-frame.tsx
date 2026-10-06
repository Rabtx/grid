import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, Show } from "solid-js";

import { SplitHandle, SplitShare } from "@/kit";

import { clampRatio, RATIO } from "../lib/layout";
import { layoutsStore } from "../stores/layouts";

import { Workspace, type WorkspaceProps } from "./workspace";

/**
 * The thread beside its workspace on desktop: the thread on the left, a handle to drag, the
 * workspace on the right. In Focus the workspace is hidden, not unmounted, once it has been
 * opened, so coming back to Split finds the terminal still connected.
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
			class={`flex min-h-0 min-w-0 flex-1 ${open() ? "gap-1 py-2 pr-2" : ""}`}
		>
			<SplitShare share={open() ? layout().ratio : 1}>{props.children}</SplitShare>
			<Show when={visited() && props.wide}>
				<SplitHandle
					orientation="vertical"
					label="Resize the thread and its workspace"
					value={Math.round(layout().ratio * 100)}
					min={Math.round(RATIO.min * 100)}
					max={Math.round(RATIO.max * 100)}
					hidden={!open()}
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
				<SplitShare share={1 - layout().ratio} hidden={!open()} row>
					<Workspace {...props} />
				</SplitShare>
			</Show>
		</div>
	);
}
