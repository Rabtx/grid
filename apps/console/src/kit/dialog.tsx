import type { JSX } from "@solidjs/web";
import { createEffect, Show } from "solid-js";

import { CloseIcon } from "./icons";

import { attachSwipe } from "./sheet-gestures";

type Kind = "dialog" | "drawer" | "sidebar";

// dialog: a bottom sheet on phones; from md a centred card.
// drawer: full screen on phones; from md a panel on the right, as tall as the window.
// sidebar: navigation from the left edge, for phones.
const PLACEMENT: Record<Kind, string> = {
	sidebar:
		"m-0 mr-auto h-dvh max-h-dvh w-[min(20rem,calc(100vw-3rem))] max-w-none -translate-x-full bg-surface-sunken pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] open:translate-x-0 starting:open:-translate-x-full",
	dialog:
		"mx-0 mt-auto mb-0 max-h-[92dvh] w-full max-w-none translate-y-full rounded-t-kit-2xl pb-[env(safe-area-inset-bottom)] open:translate-y-0 starting:open:translate-y-full md:m-auto md:max-h-[85dvh] md:w-[min(var(--dialog-width,30rem),calc(100vw-2rem))] md:translate-y-0 md:rounded-kit-xl md:pb-0 md:opacity-0 md:open:opacity-100 md:starting:open:translate-y-2 md:starting:open:opacity-0",
	drawer:
		"m-0 h-dvh max-h-dvh w-full max-w-none translate-y-full pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] open:translate-y-0 starting:open:translate-y-full md:my-2 md:mr-2 md:ml-auto md:h-[calc(100dvh-1rem)] md:max-h-[calc(100dvh-1rem)] md:w-[min(var(--dialog-width,42rem),calc(100vw-1rem))] md:translate-x-[calc(100%+1rem)] md:translate-y-0 md:rounded-kit-xl md:pt-0 md:pb-0 md:open:translate-x-0 md:starting:open:translate-x-[calc(100%+1rem)] md:starting:open:translate-y-0",
};

/**
 * A modal on the native `<dialog>`: focus is trapped, the page is inert and Escape closes it.
 * Tapping the backdrop or swiping the phone sheet down closes it too. The caller owns `open`.
 */
export function Dialog(props: {
	open: boolean;
	onClose: () => void;
	title: string;
	description?: string;
	kind?: Kind;
	/** Width from md, e.g. `36rem`. */
	width?: string;
	/** Buttons along the bottom, right-aligned on desktop and stacked on phones. */
	footer?: JSX.Element;
	/** Hide the title bar; the content draws its own. */
	bare?: boolean;
	children: JSX.Element;
}): JSX.Element {
	let dialog: HTMLDialogElement | undefined;
	const kind = () => props.kind ?? "dialog";

	createEffect(
		() => props.open,
		(open) => {
			if (!dialog) return;
			if (open && !dialog.open) dialog.showModal();
			else if (!open && dialog.open) dialog.close();
		},
	);

	return (
		// oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- backdrop light-dismiss; Escape already closes the modal dialog
		<dialog
			ref={(el) => {
				dialog = el;
				attachSwipe(
					el,
					() =>
						kind() === "sidebar"
							? "left"
							: kind() === "drawer" && matchMedia("(min-width: 48rem)").matches
								? null
								: "down",
					() => props.onClose(),
				);
			}}
			aria-label={props.title}
			onClose={() => props.onClose()}
			onClick={(event) => {
				if (event.target === event.currentTarget) props.onClose();
			}}
			style={props.width ? { "--dialog-width": props.width } : undefined}
			class={`flex-col overflow-hidden bg-surface-raised p-0 text-fg shadow-float transition-[translate,opacity,display,overlay] transition-discrete duration-slow ease-sheet backdrop:bg-black/30 open:flex ${PLACEMENT[kind()]}`}
		>
			<Show when={kind() !== "sidebar"}>
				<div
					aria-hidden="true"
					class="pointer-events-none mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-fill-strong md:hidden"
				/>
			</Show>
			<Show when={!props.bare}>
				<header class="flex shrink-0 items-start gap-3 px-5 pt-4 pb-3 md:pt-5">
					<div class="min-w-0 flex-1">
						<h2 class="font-medium text-fg text-heading">{props.title}</h2>
						<Show when={props.description}>
							<p class="mt-0.5 text-body text-fg-subtle">{props.description}</p>
						</Show>
					</div>
					<button
						type="button"
						aria-label="Close"
						onClick={() => props.onClose()}
						class="focus-ring -mt-1 -mr-2 grid size-kit-control-sm shrink-0 place-items-center rounded-kit text-fg-subtle hover:bg-fill hover:text-fg"
					>
						<CloseIcon class="size-4" />
					</button>
				</header>
			</Show>
			<div class={`min-h-0 flex-1 overflow-y-auto ${props.bare ? "" : "px-5 pb-5"}`}>
				{props.children}
			</div>
			<Show when={props.footer}>
				<footer class="flex shrink-0 flex-col-reverse gap-2 border-line border-t px-5 py-3 md:flex-row md:justify-end">
					{props.footer}
				</footer>
			</Show>
		</dialog>
	);
}

/** Are you sure: what will happen, and a button that says so. Danger in red when it cannot be undone. */
export function ConfirmDialog(props: {
	open: boolean;
	onClose: () => void;
	onConfirm: () => void;
	title: string;
	description: string;
	confirm: string;
	danger?: boolean;
}): JSX.Element {
	return (
		<Dialog
			open={props.open}
			onClose={props.onClose}
			title={props.title}
			width="26rem"
			footer={
				<>
					<button
						type="button"
						onClick={() => props.onClose()}
						class="focus-ring h-kit-control rounded-kit px-3 font-medium text-body text-fg-muted hover:bg-fill hover:text-fg"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={() => {
							props.onConfirm();
							props.onClose();
						}}
						class={`focus-ring h-kit-control rounded-kit px-3 font-medium text-body ${props.danger ? "bg-danger text-white hover:bg-danger/90" : "bg-inverse text-inverse-fg hover:bg-inverse/88"}`}
					>
						{props.confirm}
					</button>
				</>
			}
		>
			<p class="text-body text-fg-muted">{props.description}</p>
		</Dialog>
	);
}
