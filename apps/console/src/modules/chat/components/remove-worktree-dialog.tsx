import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import { Alert, Button, Code, Dialog, Skeleton, Stack, Text } from "@/kit";

import type { WorktreeStatus } from "../types/chat.types";

export type RemoveOptions = { deleteBranch: boolean; force?: boolean };

function plural(count: number, one: string): string {
	return `${count} ${one}${count === 1 ? "" : "s"}`;
}

/**
 * Removing a worktree. It says first what would be lost: uncommitted changes, and commits that
 * are nowhere else. Keeping the branch is the safe default; deleting it, or throwing changes away,
 * is its own, clearly named choice.
 */
export function RemoveWorktreeDialog(props: {
	open: boolean;
	status: WorktreeStatus | null;
	/** What happens to the thread using it, if one does. */
	description: string;
	pending: boolean;
	error: string | null;
	onClose: () => void;
	onRemove: (options: RemoveOptions) => void;
}): JSX.Element {
	const changed = () => props.status?.changed ?? 0;
	const unpushed = () => props.status?.unpushed ?? 0;
	return (
		<Dialog
			open={props.open}
			onClose={props.onClose}
			title="Remove this worktree?"
			description={props.description}
			width="30rem"
			footer={
				<>
					<Button onClick={props.onClose}>Cancel</Button>
					<Show
						when={changed() === 0}
						fallback={
							<Button
								variant="danger"
								disabled={props.pending || !props.status}
								onClick={() => props.onRemove({ deleteBranch: false, force: true })}
							>
								Throw away {plural(changed(), "change")}
							</Button>
						}
					>
						{/* A branch the thread did not make (a pull request's) is never offered for deleting. */}
						<Show when={!props.status?.adopted}>
							<Button
								variant="danger"
								disabled={props.pending || !props.status}
								onClick={() => props.onRemove({ deleteBranch: true, force: unpushed() > 0 })}
							>
								{unpushed() > 0
									? `Delete branch and ${plural(unpushed(), "commit")}`
									: "Delete branch too"}
							</Button>
						</Show>
						<Button
							variant="primary"
							disabled={props.pending || !props.status}
							onClick={() => props.onRemove({ deleteBranch: false })}
						>
							Remove, keep branch
						</Button>
					</Show>
				</>
			}
		>
			<Stack gap={3}>
				<Show when={props.status} fallback={<Skeleton class="h-10" />}>
					{(current) => (
						<Stack gap={2}>
							<Text tone="subtle">
								<Code>{current().branch}</Code>
								{current().base ? ` from ${current().base}` : ""}
							</Text>
							<Text size="caption" tone="subtle">
								{changed() > 0
									? `${plural(changed(), "file")} changed and not committed: commit them first, or throw them away.`
									: current().adopted
										? "The branch is not this thread's own, so it stays; only the worktree goes."
										: unpushed() > 0
											? `${plural(unpushed(), "commit")} not pushed or merged. Keeping the branch keeps them.`
											: "Nothing uncommitted or unpushed: nothing is lost either way."}
							</Text>
						</Stack>
					)}
				</Show>
				<Show when={props.error}>{(message) => <Alert tone="danger" title={message()} />}</Show>
			</Stack>
		</Dialog>
	);
}
