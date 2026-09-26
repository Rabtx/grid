import type { JSX } from "@solidjs/web";
import { createUniqueId, Show, omit } from "solid-js";

const CONTROL =
	"w-full rounded-kit bg-surface px-3 text-fg text-field shadow-[inset_0_0_0_1px_var(--kit-line-strong)] outline-none transition-shadow duration-fast ease-out-grid placeholder:text-fg-faint hover:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--ink)_20%,transparent)] focus:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--ink)_35%,transparent),0_0_0_3px_var(--kit-fill-strong)] disabled:opacity-50 read-only:bg-fill aria-invalid:shadow-[inset_0_0_0_1px_var(--signal-danger)]";

export function Input(props: JSX.InputHTMLAttributes<HTMLInputElement>): JSX.Element {
	const rest = omit(props, "class");
	return <input {...rest} class={`${CONTROL} h-kit-control ${props.class ?? ""}`} />;
}

export function Textarea(props: JSX.TextareaHTMLAttributes<HTMLTextAreaElement>): JSX.Element {
	const rest = omit(props, "class");
	return <textarea {...rest} class={`${CONTROL} min-h-20 resize-y py-2 ${props.class ?? ""}`} />;
}

/** An input with a search glyph inside it. */
export function SearchInput(
	props: JSX.InputHTMLAttributes<HTMLInputElement> & { icon: JSX.Element },
): JSX.Element {
	const rest = omit(props, "class", "icon");
	return (
		<div class={`relative ${props.class ?? ""}`}>
			<span class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-subtle">
				{props.icon}
			</span>
			<input type="search" {...rest} class={`${CONTROL} h-kit-control pl-8`} />
		</div>
	);
}

/** A label over its control, with a hint or an error under it. */
export function Field(props: {
	label: string;
	hint?: string;
	error?: string | null;
	children: (id: string) => JSX.Element;
}): JSX.Element {
	const id = createUniqueId();
	return (
		<div class="flex flex-col gap-1.5">
			<label for={id} class="font-medium text-body text-fg">
				{props.label}
			</label>
			{props.children(id)}
			<Show
				when={props.error}
				fallback={
					<Show when={props.hint}>
						<p class="text-caption text-fg-subtle">{props.hint}</p>
					</Show>
				}
			>
				<p class="text-caption text-danger">{props.error}</p>
			</Show>
		</div>
	);
}
