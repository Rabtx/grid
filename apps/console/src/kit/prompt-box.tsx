import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

/**
 * Where you write to an agent: a raised card with the text on top and a toolbar under it —
 * tools on the left, the model, the mic and send on the right — and an optional tray tucked
 * beneath for context (the folder it works in). Chat owns the text and sending; this is its shape.
 */
export function PromptBox(props: {
	field: JSX.Element;
	/** Left of the toolbar: attach, mode, project. */
	tools?: JSX.Element;
	/** Right of the toolbar, before send: the model, the mic. */
	options?: JSX.Element;
	send: JSX.Element;
	/** Under the card: where the agent works, the branch. */
	tray?: JSX.Element;
	class?: string;
}): JSX.Element {
	return (
		<div class={`relative flex flex-col ${props.class ?? ""}`}>
			<div class="relative z-10 flex flex-col rounded-kit-2xl bg-surface-raised shadow-[0_0_0_1px_var(--kit-line-strong),0_1px_2px_rgb(0_0_0/0.03)] transition-shadow duration-fast focus-within:shadow-[0_0_0_1px_color-mix(in_srgb,var(--ink)_20%,transparent),0_2px_8px_-2px_rgb(0_0_0/0.06)]">
				{props.field}
				<div class="flex items-center gap-1.5 px-3 pb-3">
					<div class="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
						{props.tools}
					</div>
					{props.options}
					{props.send}
				</div>
			</div>
			<Show when={props.tray}>
				<div class="mx-3 flex min-h-9 items-center gap-3 rounded-b-kit-lg border border-line border-t-0 bg-surface-sunken px-3 text-body text-fg-subtle pointer-coarse:min-h-11">
					{props.tray}
				</div>
			</Show>
		</div>
	);
}

/** The composer's text field: grows with its text, no chrome of its own. */
export const PROMPT_FIELD =
	"block max-h-52 min-h-16 w-full resize-none bg-transparent px-4 pt-4 pb-2 text-fg text-field outline-none placeholder:text-fg-faint";

/** A tool chip on the composer's toolbar: plus, a mode, a project. */
export const PROMPT_CHIP =
	"focus-ring inline-flex h-7 shrink-0 items-center gap-1.5 rounded-kit px-2 text-body-lg text-fg-muted transition-colors duration-fast hover:bg-fill hover:text-fg aria-expanded:bg-fill-strong pointer-coarse:h-10";

/** The bordered square at the start of the toolbar: add files, context, tools. */
export const PROMPT_ADD =
	"focus-ring grid size-7 shrink-0 place-items-center rounded-kit text-fg-muted shadow-[inset_0_0_0_1px_var(--kit-line-strong)] transition-colors duration-fast hover:bg-fill hover:text-fg aria-expanded:bg-fill-strong pointer-coarse:size-10";

/** The round send button: dark when there is something to send. */
export const SEND_BUTTON =
	"focus-ring grid size-7 shrink-0 place-items-center rounded-full bg-inverse text-inverse-fg transition-[opacity,transform] duration-fast active:scale-95 disabled:bg-fill-strong disabled:text-fg-faint pointer-coarse:size-10";
