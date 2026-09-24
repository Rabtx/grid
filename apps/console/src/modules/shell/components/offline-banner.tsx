import type { JSX } from "@solidjs/web";
import { createSignal, onSettled, Show } from "solid-js";

/**
 * A quiet strip while the device has no network. The app shell still opens offline (the service
 * worker has it), so this says why the board cannot load or save until the connection is back.
 */
export function OfflineBanner(): JSX.Element {
	const [offline, setOffline] = createSignal(!navigator.onLine);

	onSettled(() => {
		const update = () => setOffline(!navigator.onLine);
		window.addEventListener("online", update);
		window.addEventListener("offline", update);
		return () => {
			window.removeEventListener("online", update);
			window.removeEventListener("offline", update);
		};
	});

	return (
		<Show when={offline()}>
			<output
				aria-live="polite"
				class="fixed inset-x-0 top-[env(safe-area-inset-top)] z-50 mx-auto mt-2 block w-fit rounded-full bg-ink px-3 py-1 text-canvas text-ui-xs shadow-lg"
			>
				You're offline — changes will not save until you're back.
			</output>
		</Show>
	);
}
