import type { JSX } from "@solidjs/web";
import { createEffect, Show } from "solid-js";

import { Button } from "./button";
import { Sheet } from "./sheet";

/**
 * A confirmation dialog built on `Sheet` (bottom placement). Cancel is focused on open — the
 * safe choice. `tone="danger"` uses the solid red fill, reserved for a confirm dialog's final
 * action.
 */
export function ConfirmDialog(props: {
	open: boolean;
	title: string;
	description?: string;
	confirmLabel: string;
	tone?: "danger" | "default";
	pending?: boolean;
	onConfirm: () => void;
	onCancel: () => void;
}): JSX.Element {
	let cancelRef: HTMLButtonElement | undefined;

	createEffect(
		() => props.open,
		(open) => {
			if (open) {
				// Wait a frame so the dialog is in the DOM and shown before focusing.
				requestAnimationFrame(() => cancelRef?.focus());
			}
		},
	);

	return (
		<Sheet open={props.open} onClose={props.onCancel} label={props.title}>
			<div class="flex flex-col gap-4 p-4">
				<div class="flex flex-col gap-1">
					<h2 class="font-semibold text-ui">{props.title}</h2>
					<Show when={props.description}>
						<p class="text-ink/70 text-ui-sm">{props.description}</p>
					</Show>
				</div>
				<div class="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
					<Button
						variant="ghost"
						ref={(el) => {
							cancelRef = el;
						}}
						onClick={props.onCancel}
					>
						Cancel
					</Button>
					<Button
						variant={props.tone === "danger" ? "danger-solid" : "primary"}
						disabled={props.pending}
						onClick={props.onConfirm}
					>
						{props.confirmLabel}
					</Button>
				</div>
			</div>
		</Sheet>
	);
}
