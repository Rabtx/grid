import type { JSX } from "@solidjs/web";
import { createSignal, onSettled, Show } from "solid-js";

import { FloatingNotice } from "@/kit";

/**
 * A quiet pill while the device has no network. The app shell still opens offline (the service
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
			<FloatingNotice position="top">
				You're offline — changes will not save until you're back.
			</FloatingNotice>
		</Show>
	);
}
