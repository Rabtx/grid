import { useLocation } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, Show } from "solid-js";

import { Sheet } from "@/ui";

import { useShell } from "../context/shell-context";

import { Sidebar } from "./sidebar";

/**
 * Phone navigation: the sidebar, with the current project's chats listed under it, in a drawer
 * that closes itself after navigating.
 */
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
		<Sheet open={shell.drawerOpen()} onClose={close} label="Navigation" placement="side">
			{/* Phones only (the sheet is hidden from lg), so the sidebar and panel never draw twice. */}
			<Show when={!shell.desktop()}>
				<Sidebar onClose={close} nested />
			</Show>
		</Sheet>
	);
}
