import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import { CodeIcon, DockedPane, IconButton, Segmented } from "@/kit";

import { type SplitMode, setMode } from "../lib/layout";
import { layoutsStore } from "../stores/layouts";

import { Workspace, type WorkspaceProps } from "./workspace";

const OPTIONS = [
	{ value: "focus", label: "Focus" },
	{ value: "split", label: "Split" },
	{ value: "three", label: "Three" },
] as const satisfies readonly { value: SplitMode; label: string }[];

/** Focus · Split · Three, in the desktop title bar. */
export function SplitSwitch(props: { thread: string }): JSX.Element {
	return (
		<Segmented
			label="Layout"
			size="sm"
			options={OPTIONS}
			value={layoutsStore.of(props.thread).mode}
			onChange={(mode) => layoutsStore.update(props.thread, (current) => setMode(current, mode))}
		/>
	);
}

/** The phone's way in: a chip on the composer that docks the workspace above it, or puts it away. */
export function WorkspaceToggle(props: { thread: string }): JSX.Element {
	const open = () => layoutsStore.of(props.thread).mode !== "focus";
	return (
		<IconButton
			label={open() ? "Hide the workspace" : "Show the workspace"}
			size="sm"
			aria-pressed={open() ? "true" : "false"}
			class={open() ? "bg-accent/10 text-accent" : ""}
			onClick={() =>
				layoutsStore.update(props.thread, (current) => setMode(current, open() ? "focus" : "split"))
			}
		>
			<CodeIcon />
		</IconButton>
	);
}

/**
 * The workspace on a phone: one pane docked over the composer, never squeezed beside the thread.
 * It keeps the thread readable above it and the reply box in reach below.
 */
export function DockedWorkspace(props: WorkspaceProps): JSX.Element {
	const open = () => layoutsStore.of(props.place.thread).mode !== "focus";
	return (
		<Show when={open()}>
			<DockedPane>
				<Workspace {...props} single />
			</DockedPane>
		</Show>
	);
}
