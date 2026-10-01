import { useLocation } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, Show } from "solid-js";

import { Dialog } from "@/kit";

import { useShell } from "../context/shell-context";

import { Rail } from "./rail";
import { Sidebar } from "./sidebar";

/**
 * Phone navigation (the Figma Drawer): the rail and the panel side by side in a drawer from the
 * left that closes itself after navigating. A section with a panel of its own (settings) passes
 * it as `content`.
 */
export function NavDrawer(props: { content?: () => JSX.Element }): JSX.Element {
	const shell = useShell();
	const location = useLocation();
	const close = () => shell.setDrawerOpen(false);

	createEffect(
		() => location.pathname,
		() => {
			close();
		},
	);

	return (
		<Dialog open={shell.drawerOpen()} onClose={close} title="Navigation" kind="sidebar" bare>
			{/* Phones only, so the sidebar never draws twice. */}
			<Show when={!shell.desktop()}>
				<div class="flex h-full min-h-0">
					<div class="w-15 shrink-0 border-line border-r bg-fill">
						<Rail />
					</div>
					<div class="min-w-0 flex-1">
						{props.content ? props.content() : <Sidebar onClose={close} />}
					</div>
				</div>
			</Show>
		</Dialog>
	);
}
