import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, Show } from "solid-js";

import { Alert, Button, CopyLine, Dialog, Spinner, Stack, Text } from "@/kit";
import { useAuth } from "@/modules/auth";
import { chatService } from "@/modules/chat/services/chat.service";
import type { ChatSession } from "@/modules/chat/types/chat.types";
import { placementsStore } from "@/modules/environments/stores/placements";

/**
 * Sharing a thread with a guest: a link anyone can follow it with for a day, without signing in.
 * They see the conversation (not tools' inputs or files) and can ask something, which waits in
 * the thread for its person to send on.
 */
export function ShareDialog(props: {
	session: ChatSession | null;
	onClose: () => void;
}): JSX.Element {
	const auth = useAuth();
	const [link, setLink] = createSignal<{ url: string; expiresAt: string } | null>(null);
	const [error, setError] = createSignal<string | null>(null);
	const [busy, setBusy] = createSignal(false);
	const scope = (session: ChatSession) => placementsStore.scopeOf(session.project);

	createEffect(
		() => [props.session, auth.token()] as const,
		([session, token]) => {
			setLink(null);
			setError(null);
			if (!session || !token) return;
			setBusy(true);
			chatService.shareWithGuest(token, session.id, scope(session)).then(
				(made) => {
					setLink({
						url: `${window.location.origin}/guest/${made.token}`,
						expiresAt: made.link.expiresAt,
					});
					setBusy(false);
				},
				(cause: unknown) => {
					setError(cause instanceof Error ? cause.message : "Could not make a link");
					setBusy(false);
				},
			);
		},
	);

	async function stop(): Promise<void> {
		const session = props.session;
		const token = auth.token();
		if (!session || !token) return;
		setBusy(true);
		try {
			await chatService.stopSharing(token, session.id, scope(session));
			props.onClose();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not stop sharing");
		} finally {
			setBusy(false);
		}
	}

	return (
		<Dialog
			open={props.session !== null}
			onClose={props.onClose}
			title="Share with a guest"
			description="Anyone with this link can follow the thread for a day and ask something; what they ask waits for you to send it on."
			width="30rem"
			footer={
				<>
					<Button variant="ghost" disabled={busy()} onClick={() => void stop()}>
						Stop sharing
					</Button>
					<Button onClick={() => props.onClose()}>Done</Button>
				</>
			}
		>
			<Stack gap={2}>
				<Show when={error()}>{(message) => <Alert tone="danger" title={message()} />}</Show>
				<Show
					when={link()}
					fallback={
						<Show when={busy()}>
							<Spinner />
						</Show>
					}
				>
					{(made) => (
						<>
							<CopyLine label="guest link" value={made().url} />
							<Text size="caption" tone="subtle">
								Ends{" "}
								{new Date(made().expiresAt).toLocaleString(undefined, {
									weekday: "short",
									hour: "numeric",
									minute: "2-digit",
								})}
								. Stop sharing ends every link to this thread.
							</Text>
						</>
					)}
				</Show>
			</Stack>
		</Dialog>
	);
}
