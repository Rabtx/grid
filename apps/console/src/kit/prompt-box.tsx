import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";

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
	/** Floats inside the card over the text: the @-mention list. */
	overlay?: JSX.Element;
	/** The card is a form: Enter-to-send and the send button submit it. */
	onSubmit?: (event: SubmitEvent) => void;
	/** The form element, for voice dictation to find its field. */
	formRef?: (form: HTMLFormElement) => void;
	class?: string;
}): JSX.Element {
	return (
		<div class={`relative flex flex-col ${props.class ?? ""}`}>
			<form
				ref={(el) => props.formRef?.(el)}
				onSubmit={(event) => {
					event.preventDefault();
					props.onSubmit?.(event);
				}}
				class="relative z-10 flex flex-col rounded-kit-2xl bg-surface-raised shadow-lift transition-shadow duration-fast focus-within:shadow-focus"
			>
				{props.overlay}
				{props.field}
				<div class="flex items-center gap-1.5 px-3 pb-3">
					<div class="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
						{props.tools}
					</div>
					{props.options}
					{props.send}
				</div>
			</form>
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
	"focus-ring grid size-7 shrink-0 place-items-center rounded-kit text-fg-muted ring-line-strong transition-colors duration-fast hover:bg-fill hover:text-fg aria-expanded:bg-fill-strong pointer-coarse:size-10";

/** The round send button: dark when there is something to send. */
export const SEND_BUTTON =
	"focus-ring grid size-7 shrink-0 place-items-center rounded-full bg-inverse text-inverse-fg transition-[opacity,transform] duration-fast active:scale-95 disabled:bg-fill-strong disabled:text-fg-faint pointer-coarse:size-10";

/** Stop, in place of send while the agent works. */
export const STOP_BUTTON =
	"focus-ring grid size-7 shrink-0 place-items-center rounded-full bg-fill-strong text-fg transition-transform duration-fast hover:bg-fill-strong active:scale-95 pointer-coarse:size-10";

/** The composer's mic: red while it listens. */
export const MIC_BUTTON =
	"focus-ring grid size-7 shrink-0 place-items-center rounded-kit text-fg-subtle transition-colors duration-fast hover:bg-fill hover:text-fg aria-pressed:bg-danger aria-pressed:text-white pointer-coarse:size-10";

/** A round-cornered square icon button on the composer's toolbar: the mic, a tool. */
export const PROMPT_ICON =
	"focus-ring grid size-7 shrink-0 place-items-center rounded-kit text-fg-subtle transition-colors duration-fast hover:bg-fill hover:text-fg pointer-coarse:size-10";

/**
 * Ways into a first message: chips that scroll sideways on phones (in thumb reach, above the
 * composer) and a quiet list on desktop (under it).
 */
export function Suggestions(props: {
	items: readonly { icon: JSX.Element; label: string }[];
	onPick: (label: string) => void;
	/** Layout only, e.g. `md:order-last` to sit under the composer on desktop. */
	class?: string;
}): JSX.Element {
	return (
		<ul
			class={`flex gap-2 overflow-x-auto [scrollbar-width:none] md:flex-col md:gap-0.5 md:px-1 ${props.class ?? ""}`}
		>
			<For each={props.items}>
				{(item) => (
					<li class="shrink-0">
						<button
							type="button"
							onClick={() => props.onPick(item.label)}
							class="focus-ring flex h-9 items-center gap-2.5 whitespace-nowrap rounded-full px-3 text-body text-fg-muted ring-line-strong transition-colors duration-fast hover:bg-fill hover:text-fg md:h-8 md:w-full md:rounded-kit md:px-2 md:shadow-none"
						>
							<span class="text-fg-subtle">{item.icon}</span>
							{item.label}
						</button>
					</li>
				)}
			</For>
		</ul>
	);
}
