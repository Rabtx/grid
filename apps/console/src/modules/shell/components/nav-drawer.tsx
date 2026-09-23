import { useLocation } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect } from "solid-js";

import { CloseIcon, IconButton, Sheet } from "@/ui";

import { ProjectNav } from "./project-nav";

/** Phone navigation: the shared nav in a drawer that closes itself after navigating. */
export function NavDrawer(props: { open: boolean; onClose: () => void }): JSX.Element {
	const location = useLocation();

	createEffect(
		() => location.pathname,
		() => {
			props.onClose();
		},
	);

	return (
		<Sheet open={props.open} onClose={props.onClose} label="Navigation" placement="side">
			<div class="relative h-full">
				<IconButton
					label="Close navigation"
					onClick={() => props.onClose()}
					class="absolute top-2 right-2"
				>
					<CloseIcon />
				</IconButton>
				<ProjectNav />
			</div>
		</Sheet>
	);
}
