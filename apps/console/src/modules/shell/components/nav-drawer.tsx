import { useLocation } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, Show } from "solid-js";

import { Sheet } from "@/ui";

import { useShell } from "../context/shell-context";

import { Sidebar } from "./sidebar";

/**
 * Phone navigation: the sidebar, and under it the screen's workspace panel (its chats), in one
 * drawer that closes itself after navigating.
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
				<div class="flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain">
					<Show when={shell.drawerOpen() && shell.panel()} fallback={<Sidebar onClose={close} />}>
						{(panel) => (
							<>
								<Sidebar onClose={close} stacked />
								<div class="flex min-h-[60dvh] flex-col border-stroke border-t">{panel()()}</div>
							</>
						)}
					</Show>
				</div>
			</Show>
		</Sheet>
	);
}
