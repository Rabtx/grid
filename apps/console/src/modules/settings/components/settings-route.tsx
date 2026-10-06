import { useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { onSettled, Show } from "solid-js";

import { ShellSlot, useShell } from "@/modules/shell";

import { SettingsSidebar } from "./settings-sidebar";

/**
 * `/settings`: the way into settings, not a screen of its own. Desktop has the list beside the
 * screen, so it opens that list's first page. A phone has no sidebar there, so the list is the
 * screen — the same component, with the phone's own title bar above it rather than a second one.
 */
export function SettingsRoute(): JSX.Element {
	const shell = useShell();
	const navigate = useNavigate();

	onSettled(() => {
		if (shell.desktop()) navigate("/settings/profile", { replace: true });
	});

	return (
		<Show when={!shell.desktop()}>
			{/* No new thread here: the phone bar keeps that action for screens you work in. */}
			<ShellSlot name="trailing">
				<span aria-hidden="true" />
			</ShellSlot>
			<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
				<SettingsSidebar bare />
			</div>
		</Show>
	);
}
