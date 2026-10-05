import type { JSX } from "@solidjs/web";
import { createSignal, onSettled, Show } from "solid-js";

import { FloatingNotice, ReconnectingNotice } from "@/kit";
import { runnerUp } from "@/lib/runner-health";
import { machineName } from "@/modules/environments";

/**
 * Why the board cannot load or save right now: the device has no network (the service worker
 * still opens the app), or this machine's runner stopped answering and Grid is trying again.
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
		<Show
			when={offline()}
			fallback={
				<Show when={!runnerUp()}>
					<ReconnectingNotice
						title={`Reconnecting to ${machineName.name() ?? "this machine"}…`}
						detail="Agents and terminals come back when it answers"
					/>
				</Show>
			}
		>
			<FloatingNotice position="top">
				You're offline — changes will not save until you're back.
			</FloatingNotice>
		</Show>
	);
}
