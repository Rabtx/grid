import type { JSX } from "@solidjs/web";
import { createUniqueId, Show, omit } from "solid-js";

const CONTROL =
	"surface-field w-full px-3 text-fg text-field outline-none placeholder:text-fg-faint disabled:opacity-50 read-only:bg-fill";

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

/**
 * A field that takes a row's place while you rename it: selected on open, Enter saves, Escape
 * cancels, leaving saves. The caller removes it once `onDone` fires.
 */
export function InlineInput(props: {
	label: string;
	value: string;
	onSave: (value: string) => void;
	onCancel: () => void;
}): JSX.Element {
	let done = false;
	const finish = (save: boolean, value: string) => {
		if (done) return;
		done = true;
		if (save) props.onSave(value);
		else props.onCancel();
	};
	return (
		<input
			ref={(el) => queueMicrotask(() => el.select())}
			value={props.value}
			aria-label={props.label}
			onKeyDown={(event) => {
				if (event.key === "Enter") finish(true, event.currentTarget.value);
				else if (event.key === "Escape") finish(false, event.currentTarget.value);
			}}
			onBlur={(event) => finish(true, event.currentTarget.value)}
			class="surface-field h-[calc(var(--kit-h-row)-0.25rem)] w-full px-2 text-body text-fg outline-none pointer-coarse:h-11 pointer-coarse:text-field"
		/>
	);
}

/** A title you edit in place: a big borderless line, like a document's heading. */
export function TitleInput(props: JSX.InputHTMLAttributes<HTMLInputElement>): JSX.Element {
	const rest = omit(props, "class");
	return (
		<input
			{...rest}
			class={`focus-ring w-full min-w-0 rounded-kit-sm bg-transparent font-medium text-fg text-headline outline-none placeholder:text-fg-faint ${props.class ?? ""}`}
		/>
	);
}
