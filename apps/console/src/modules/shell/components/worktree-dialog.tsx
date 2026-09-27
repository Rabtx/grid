import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, Show } from "solid-js";

import { Alert, Button, Code, Dialog, Skeleton, Stack, Text } from "@/kit";
import { useAuth } from "@/modules/auth";
import { chatService } from "@/modules/chat/services/chat.service";
import { threadsStore } from "@/modules/chat/stores/threads";
import type { ChatSession, WorktreeStatus } from "@/modules/chat/types/chat.types";
import { placementsStore } from "@/modules/environments/stores/placements";

function plural(count: number, one: string): string {
	return `${count} ${one}${count === 1 ? "" : "s"}`;
}

/**
 * Remove a thread's worktree. It says first what would be lost: uncommitted changes, and commits
 * that are nowhere else. Keeping the branch is the safe default; deleting it, or throwing changes
 * away, is its own, clearly named choice. The thread carries on in the project's folder.
 */
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

	async function discard(options: { deleteBranch: boolean; force?: boolean }): Promise<void> {
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

	const changed = () => status()?.changed ?? 0;
	const unpushed = () => status()?.unpushed ?? 0;

	return (
		<Dialog
			open={props.session !== null}
			onClose={props.onClose}
			title="Remove this thread's worktree?"
			description="The thread carries on in the project's own folder."
			width="30rem"
			footer={
				<>
					<Button onClick={props.onClose}>Cancel</Button>
					<Show
						when={changed() === 0}
						fallback={
							<Button
								variant="danger"
								disabled={pending() || !status()}
								onClick={() => void discard({ deleteBranch: false, force: true })}
							>
								Throw away {plural(changed(), "change")}
							</Button>
						}
					>
						<Button
							variant="danger"
							disabled={pending() || !status()}
							onClick={() => void discard({ deleteBranch: true, force: unpushed() > 0 })}
						>
							{unpushed() > 0
								? `Delete branch and ${plural(unpushed(), "commit")}`
								: "Delete branch too"}
						</Button>
						<Button
							variant="primary"
							disabled={pending() || !status()}
							onClick={() => void discard({ deleteBranch: false })}
						>
							Remove, keep branch
						</Button>
					</Show>
				</>
			}
		>
			<Stack gap={3}>
				<Show when={status()} fallback={<Skeleton class="h-10" />}>
					{(current) => (
						<Stack gap={2}>
							<Text tone="subtle">
								<Code>{current().branch}</Code>
								{current().base ? ` from ${current().base}` : ""}
							</Text>
							<Text size="caption" tone="subtle">
								{changed() > 0
									? `${plural(changed(), "file")} changed and not committed: commit them in the thread first, or throw them away.`
									: unpushed() > 0
										? `${plural(unpushed(), "commit")} not pushed or merged. Keeping the branch keeps them.`
										: "Nothing uncommitted or unpushed: nothing is lost either way."}
							</Text>
						</Stack>
					)}
				</Show>
				<Show when={error()}>{(message) => <Alert tone="danger" title={message()} />}</Show>
			</Stack>
		</Dialog>
	);
}
