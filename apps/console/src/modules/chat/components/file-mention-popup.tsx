import type { JSX } from "@solidjs/web";
import { createEffect, For, Show } from "solid-js";

import { FileIcon, SpinnerIcon } from "@/ui";

export type FileMentionPopupProps = {
	files: string[];
	loading: boolean;
	selectedIndex: number;
	onSelect: (file: string) => void;
	onClose: () => void;
};

function fileName(path: string): string {
	return path.split("/").pop() ?? path;
}

function fileDir(path: string): string {
	const parts = path.split("/");
	parts.pop();
	return parts.length > 0 ? parts.join("/") : "";
}

/**
 * Autocomplete popup for @ file mentions in the chat composer.
 * Sits directly above the textarea on both phone and desktop.
 */
export function FileMentionPopup(props: FileMentionPopupProps): JSX.Element {
	let listRef: HTMLUListElement | undefined;

	createEffect(
		() => props.selectedIndex,
		(index) => {
			if (!listRef) return;
			const el = listRef.children[index] as HTMLElement | undefined;
			el?.scrollIntoView?.({ block: "nearest" });
		},
	);

	return (
		<div
			class="absolute bottom-full mb-1.5 left-0 right-0 z-30 flex max-h-60 flex-col overflow-hidden rounded-lg border border-ink/10 bg-canvas/95 backdrop-blur-md shadow-xl md:left-2 md:right-auto md:w-96"
			aria-label="File mentions"
		>
			<div class="flex shrink-0 items-center justify-between border-b border-ink/5 px-2.5 py-1 text-ink/40 text-ui-xs">
				<span class="font-medium">
					Files <Show when={props.files.length > 0}>({props.files.length})</Show>
				</span>
				<div class="flex items-center gap-1.5">
					<Show when={props.loading}>
						<SpinnerIcon class="size-3 animate-spin text-ink/40" />
					</Show>
					<span class="hidden md:inline">↑↓ navigate · ↵ select · esc close</span>
				</div>
			</div>

			<Show
				when={props.files.length > 0}
				fallback={
					<div class="flex items-center justify-center p-4 text-ink/40 text-ui-xs">
						<Show when={props.loading} fallback={<span>No matching files found</span>}>
							<div class="flex items-center gap-2">
								<SpinnerIcon class="size-3.5 animate-spin" />
								<span>Searching files…</span>
							</div>
						</Show>
					</div>
				}
			>
				<ul
					ref={(el) => {
						listRef = el;
					}}
					aria-label="File choices"
					class="flex min-h-0 flex-1 flex-col overflow-y-auto p-1 [scrollbar-width:thin]"
				>
					<For each={props.files}>
						{(file, index) => {
							const selected = () => index() === props.selectedIndex;
							return (
								<li>
									<button
										type="button"
										data-selected={selected() ? "true" : "false"}
										aria-current={selected() ? "true" : undefined}
										onMouseDown={(event) => {
											// Prevent textarea blur before selection is applied
											event.preventDefault();
											props.onSelect(file);
										}}
										class={`flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-ui-sm transition-colors duration-fast pointer-coarse:h-11 ${
											selected()
												? "bg-ink/10 text-ink font-medium"
												: "text-ink/80 hover:bg-ink/5 hover:text-ink"
										}`}
									>
										<FileIcon class="size-3.5 shrink-0 text-ink/40" />
										<span class="truncate font-mono text-ui-xs">{fileName(file)}</span>
										<Show when={fileDir(file)}>
											<span class="ml-auto truncate font-mono text-ink/35 text-ui-xs">
												{fileDir(file)}
											</span>
										</Show>
									</button>
								</li>
							);
						}}
					</For>
				</ul>
			</Show>
		</div>
	);
}
