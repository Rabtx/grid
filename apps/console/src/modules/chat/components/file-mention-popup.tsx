import type { JSX } from "@solidjs/web";

import { AutocompleteList, EntryIcon } from "@/kit";

export type FileMentionPopupProps = {
	/** The list's id, for the field's `aria-controls`. */
	id: string;
	files: string[];
	loading: boolean;
	selectedIndex: number;
	/** The project's name, for the caption ("Files in grid"). */
	project?: string | null;
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
 * Autocomplete for @ file mentions in the chat composer, floating just above the field on both
 * phone and desktop.
 */
export function FileMentionPopup(props: FileMentionPopupProps): JSX.Element {
	return (
		<AutocompleteList
			id={props.id}
			label="File mentions"
			heading={props.project ? `Files in ${props.project}` : "Files"}
			items={props.files.map((file) => ({
				id: file,
				icon: <EntryIcon name={fileName(file)} folder={false} />,
				label: fileName(file),
				detail: fileDir(file) || undefined,
			}))}
			active={props.selectedIndex}
			loading={props.loading}
			empty="No matching files found"
			onPick={props.onSelect}
		/>
	);
}
