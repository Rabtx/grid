import type { JSX } from "@solidjs/web";
import { createEffect, createSignal } from "solid-js";

import { useAuth } from "@/modules/auth";
import {
	type RemoveOptions,
	RemoveWorktreeDialog,
} from "@/modules/chat/components/remove-worktree-dialog";
import { chatService } from "@/modules/chat/services/chat.service";
import { threadsStore } from "@/modules/chat/stores/threads";
import type { ChatSession, WorktreeStatus } from "@/modules/chat/types/chat.types";
import { placementsStore } from "@/modules/environments/stores/placements";

/** Remove a thread's worktree from its menu; the thread carries on in the project's folder. */
export function WorktreeDialog(props: {
	session: ChatSession | null;
	onClose: () => void;
}): JSX.Element {
	const auth = useAuth();
	const [status, setStatus] = createSignal<WorktreeStatus | null>(null);
	const [error, setError] = createSignal<string | null>(null);
	const [pending, setPending] = createSignal(false);

	createEffect(
		() => [props.session, auth.token()] as const,
		([session, token]) => {
			setStatus(null);
			setError(null);
			if (!session || !token) return;
			chatService
				.worktree(token, session.id, placementsStore.scopeOf(session.project))
				.then((found) => {
					if (props.session?.id === session.id) setStatus(found);
				})
				.catch((cause) => setError(cause instanceof Error ? cause.message : "Could not read it"));
		},
	);

	async function remove(options: RemoveOptions): Promise<void> {
		const session = props.session;
		const token = auth.token();
		if (!session || !token) return;
		setPending(true);
		setError(null);
		try {
			await threadsStore.discardWorktree(token, session, options);
			props.onClose();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not remove it");
		} finally {
			setPending(false);
		}
	}

	return (
		<RemoveWorktreeDialog
			open={props.session !== null}
			status={status()}
			description="The thread carries on in the project's own folder."
			pending={pending()}
			error={error()}
			onClose={props.onClose}
			onRemove={(options) => void remove(options)}
		/>
	);
}
