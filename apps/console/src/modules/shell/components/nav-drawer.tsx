import { useLocation } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, Show } from "solid-js";

import { Dialog } from "@/kit";

import { useShell } from "../context/shell-context";

import { Sidebar } from "./sidebar";

/** Phone navigation: the sidebar in a drawer from the left that closes itself after navigating. */
export function NavDrawer(): JSX.Element {
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
				<Sidebar onClose={close} />
			</Show>
		</Dialog>
	);
}
