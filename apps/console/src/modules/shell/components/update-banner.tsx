import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import { applyUpdate, updateReady } from "@/pwa/register";
import { Button } from "@/ui";

/** A quiet strip at the bottom when a new version is installed, with a one-tap reload. */
export function UpdateBanner(): JSX.Element {
	return (
		<Show when={updateReady()}>
			<output
				aria-live="polite"
				class="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl border border-ink/10 bg-canvas px-4 py-3 shadow-xl"
			>
				<p class="min-w-0 flex-1 text-ink/80 text-ui-sm">A new version of Grid is ready.</p>
				<Button variant="primary" size="sm" onClick={() => applyUpdate()}>
					Reload
				</Button>
			</output>
		</Show>
	);
}
