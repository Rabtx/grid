import type { JSX } from "@solidjs/web";
import { createSignal, Show } from "solid-js";

import { FileIcon, FolderIcon } from "./icons";

/** The picture for a file or folder: its URL, or null for the generic glyph. */
export type FileIconResolver = (name: string, folder: boolean, open: boolean) => string | null;

const [resolver, setResolver] = createSignal<FileIconResolver | null>(null);

/**
 * Hand the kit a way to find each file's and folder's own icon (the app loads an icon theme at
 * start). Until then, and for anything it has no icon for, trees show the generic glyphs.
 */
export function setFileIcons(next: FileIconResolver | null): void {
	setResolver(() => next);
}

/** A file's or folder's icon in a tree row: its own from the icon theme, else the generic one. */
export function EntryIcon(props: { name: string; folder: boolean; open?: boolean }): JSX.Element {
	const url = () => resolver()?.(props.name, props.folder, props.open ?? false) ?? null;
	return (
		<Show
			when={url()}
			fallback={
				<Show when={props.folder} fallback={<FileIcon class="size-4" />}>
					<FolderIcon class="size-4" />
				</Show>
			}
		>
			{(src) => <img src={src()} alt="" draggable={false} class="size-4 shrink-0 select-none" />}
		</Show>
	);
}
