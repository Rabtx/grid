import { useNavigate, useParams } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, Show, untrack } from "solid-js";

import { EmptyState, Spinner, TextLink } from "@/kit";
import { useAuth } from "@/modules/auth";
import { placementsStore } from "@/modules/environments/stores/placements";

import { chatService } from "../services/chat.service";

/**
 * A thread an agent linked to (`grid-thread://<id>`, opened at `/thread/<id>`): found on this
 * machine or another the workspace runs on, then opened in its project.
 */
export function ThreadLink(): JSX.Element {
	const params = useParams<{ id: string }>();
	const auth = useAuth();
	const navigate = useNavigate();
	const [missing, setMissing] = createSignal(false);

	createEffect(
		() => [auth.token(), params.id] as const,
		([token, id]) => {
			setMissing(false);
			if (!token || !id) return;
			void (async () => {
				for (const scope of untrack(placementsStore.scopes)) {
					const found = await chatService.thread(token, id, scope).catch(() => null);
					if (found) {
						navigate(`/chat/${encodeURIComponent(found.project)}/${encodeURIComponent(found.id)}`, {
							replace: true,
						});
						return;
					}
				}
				setMissing(true);
			})();
		},
	);

	return (
		<Show when={missing()} fallback={<Spinner />}>
			<EmptyState
				title="That thread is not here"
				description="It was deleted, or it is in a workspace or on a machine you cannot reach."
				action={
					<TextLink tone="accent" href="/chat">
						Go to your threads
					</TextLink>
				}
			/>
		</Show>
	);
}
