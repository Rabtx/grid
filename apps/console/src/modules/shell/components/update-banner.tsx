import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import { Button, FloatingNotice } from "@/kit";
import { applyUpdate, updateReady } from "@/pwa/register";

/** A card at the bottom when a new version is installed, with a one-tap reload. */
export function UpdateBanner(): JSX.Element {
	return (
		<Show when={updateReady()}>
			<FloatingNotice
				position="bottom"
				action={
					<Button variant="primary" size="sm" onClick={() => applyUpdate()}>
						Reload
					</Button>
				}
			>
				A new version of Grid is ready.
			</FloatingNotice>
		</Show>
	);
}
