import type { JSX } from "@solidjs/web";
import { omit, Show } from "solid-js";

const INPUT =
	"h-field w-full min-w-0 rounded-md border border-ink/12 bg-canvas/40 px-2.5 text-ink text-ui-input outline-none transition-colors duration-fast ease-out-grid placeholder:text-ink/35 hover:border-ink/20 focus:border-ink/30 disabled:opacity-50 aria-[invalid=true]:border-danger/60";

type InputProps = JSX.InputHTMLAttributes<HTMLInputElement>;

/** A text input. Focus shows as a stronger border, not a glow. */
export function Input(props: InputProps): JSX.Element {
	const rest = omit(props, "class");
	return <input class={`${INPUT} ${props.class ?? ""}`} {...rest} />;
}

const TEXTAREA =
	"min-h-24 w-full min-w-0 resize-y rounded-md border border-ink/12 bg-canvas/40 px-2.5 py-2 text-ink text-ui-input outline-none transition-colors duration-fast ease-out-grid placeholder:text-ink/35 hover:border-ink/20 focus:border-ink/30 disabled:opacity-50 aria-[invalid=true]:border-danger/60";

type TextareaProps = JSX.TextareaHTMLAttributes<HTMLTextAreaElement>;

/** A multi-line text input with the same material as `Input`. */
export function Textarea(props: TextareaProps): JSX.Element {
	const rest = omit(props, "class");
	return <textarea class={`${TEXTAREA} ${props.class ?? ""}`} {...rest} />;
}

/**
 * A labelled form field: label above, the control, then either the error or a hint. The label
 * wraps the control, so clicking it focuses the input without ids.
 */
export function Field(props: {
	label: string;
	hint?: string;
	error?: string | null;
	children: JSX.Element;
}): JSX.Element {
	return (
		<label class="flex flex-col gap-1.5">
			<span class="font-medium text-ink/80 text-ui-sm">{props.label}</span>
			{props.children}
			<Show
				when={props.error}
				fallback={
					<Show when={props.hint}>
						<span class="text-ink/50 text-ui-xs">{props.hint}</span>
					</Show>
				}
			>
				{(error) => <span class="text-danger text-ui-xs">{error()}</span>}
			</Show>
		</label>
	);
}
