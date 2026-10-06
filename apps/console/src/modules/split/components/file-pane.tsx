import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, Show } from "solid-js";

import { useAuth } from "@/modules/auth";
import { FileChange } from "@/modules/chat/components/transcript-view";
import type { FileDiff } from "@/modules/chat/types/chat.types";
import { filesService } from "@/modules/projects";
import { Alert, CodeView, EmptyState, FileIcon, Skeleton, Stack } from "@/kit";

import { insideFolder } from "../lib/paths";

type Read =
	| { status: "loading" }
	| { status: "text"; text: string }
	| { status: "unreadable"; message: string }
	| { status: "error"; message: string };

/**
 * A file the thread is working on. In the project's own folder it is read as it is now, and read
 * again whenever the agent edits it. A thread in a worktree works on its own copy, which the
 * project's folder does not hold: there the pane shows the agent's changes to it instead, so it
 * never shows the wrong version of the file.
 */
export function FilePane(props: {
	project: string;
	/** The project's folder on its machine. */
	folder: string | undefined;
	/** Where the thread works: the folder, or a worktree. */
	cwd: string;
	path: string;
	/** The agent's edits to this file, in order. */
	diffs: FileDiff[];
	active: boolean;
}): JSX.Element {
	const auth = useAuth();
	const [read, setRead] = createSignal<Read>({ status: "loading" });
	const relative = () =>
		props.folder && props.cwd === props.folder ? insideFolder(props.folder, props.path) : null;
	let request = 0;

	// Read while showing, and again after each edit the agent makes to it (one more diff).
	createEffect(
		() => [props.active, relative(), props.diffs.length] as const,
		([active, path]) => {
			const token = auth.token();
			if (!active || path === null || !token) return;
			const current = ++request;
			void filesService.read(token, props.project, path).then(
				(file) => {
					if (current !== request) return;
					setRead(
						file.text === null
							? {
									status: "unreadable",
									message: file.binary ? "This file is binary." : "This file is too large to show.",
								}
							: { status: "text", text: file.text },
					);
				},
				(cause) => {
					if (current === request)
						setRead({
							status: "error",
							message: cause instanceof Error ? cause.message : "Could not read this file",
						});
				},
			);
		},
	);

	const changes = () => (
		<Show
			when={props.diffs.length > 0}
			fallback={
				<EmptyState
					icon={<FileIcon />}
					title="No changes to show"
					description="This thread works in its own worktree; its edits to this file show here."
				/>
			}
		>
			<Stack gap={3} class="p-3">
				<For each={props.diffs}>{(diff) => <FileChange diff={diff} />}</For>
			</Stack>
		</Show>
	);

	return (
		<div class="min-h-0 flex-1 overflow-auto overscroll-contain">
			<Show when={relative() !== null} fallback={changes()}>
				<Show
					when={read().status === "text"}
					fallback={
						<Show
							when={read().status === "loading"}
							fallback={
								<div class="p-3">
									<Alert
										tone={read().status === "error" ? "danger" : "accent"}
										title={(read() as { message: string }).message}
									/>
									{changes()}
								</div>
							}
						>
							<Stack gap={2} class="p-4">
								<Skeleton class="h-3 w-2/3" />
								<Skeleton class="h-3 w-1/2" />
								<Skeleton class="h-3 w-3/4" />
							</Stack>
						</Show>
					}
				>
					{/* An empty file is still a file: its one empty line is shown, not an error. */}
					<CodeView text={(read() as { text: string }).text} />
				</Show>
			</Show>
		</div>
	);
}
