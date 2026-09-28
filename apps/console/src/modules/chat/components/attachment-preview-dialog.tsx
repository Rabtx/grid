import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import { Dialog, formatFileSize, Text } from "@/kit";

export function AttachmentPreviewDialog(props: {
	open: boolean;
	name: string;
	size?: number;
	preview?: string;
	onClose: () => void;
}): JSX.Element {
	return (
		<Dialog
			open={props.open}
			onClose={props.onClose}
			title={props.name}
			description={props.size !== undefined ? formatFileSize(props.size) : undefined}
			width="36rem"
		>
			<div class="flex max-h-96 items-center justify-center overflow-hidden bg-surface-sunken p-2 md:max-h-128">
				<Show
					when={props.preview}
					fallback={
						<Text tone="subtle" class="py-12">
							No preview available
						</Text>
					}
				>
					{(url) => (
						<img
							src={url()}
							alt={props.name}
							class="max-h-96 max-w-full object-contain md:max-h-128"
						/>
					)}
				</Show>
			</div>
		</Dialog>
	);
}
