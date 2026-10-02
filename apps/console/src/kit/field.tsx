import type { JSX } from "@solidjs/web";
import { createSignal, createUniqueId, omit, onSettled, Show } from "solid-js";

import { EyeIcon, EyeOffIcon } from "./icons";

const CONTROL =
	"surface-field w-full px-3 text-fg text-field outline-none placeholder:text-fg-faint disabled:opacity-50 read-only:bg-fill";

/** The Figma Input, Shape: Pill, X-Large: 44px, set into the surface. For sign-in and setup forms. */
const PILL =
	"surface-recessed h-11 w-full px-5 text-fg text-field outline-none placeholder:text-fg-faint disabled:opacity-50";

type Shape = {
	/** `pill`: the 44px recessed pill the sign-in and setup forms use. */ shape?: "pill";
};

/**
 * `autofocus` taken on where the browser does not: it only honours the first on a page, so a field
 * that appears later (a form's next step) would otherwise leave focus on the body.
 */
function focusOnArrival(wanted: boolean | "" | undefined): (el: HTMLInputElement) => void {
	let field: HTMLInputElement | undefined;
	onSettled(() => {
		if (wanted !== undefined && wanted !== false) field?.focus();
	});
	return (el) => {
		field = el;
	};
}

export function Input(props: JSX.InputHTMLAttributes<HTMLInputElement> & Shape): JSX.Element {
	const rest = omit(props, "class", "shape");
	const ref = focusOnArrival(props.autofocus);
	return (
		<input
			{...rest}
			ref={ref}
			class={`${props.shape === "pill" ? PILL : `${CONTROL} h-kit-control`} ${props.class ?? ""}`}
		/>
	);
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
	/** For a pill control: a 12px label and hint set in to line up with the text inside it. */
	pill?: boolean;
	children: (id: string) => JSX.Element;
}): JSX.Element {
	const id = createUniqueId();
	const inset = () => (props.pill ? "px-5" : "");
	return (
		<div class={`flex flex-col ${props.pill ? "gap-2" : "gap-1.5"}`}>
			<label
				for={id}
				class={`font-medium text-fg ${props.pill ? "px-5 text-caption" : "text-body"}`}
			>
				{props.label}
			</label>
			{props.children(id)}
			<Show
				when={props.error}
				fallback={
					<Show when={props.hint}>
						<p class={`text-caption text-fg-subtle ${inset()}`}>{props.hint}</p>
					</Show>
				}
			>
				<p class={`text-caption text-danger ${inset()}`}>{props.error}</p>
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

/** A value that edits in place (a task's branch, an owner's name): plain until hovered or focused. */
export function QuietInput(props: JSX.InputHTMLAttributes<HTMLInputElement>): JSX.Element {
	const rest = omit(props, "class");
	return (
		<input
			{...rest}
			class={`focus-ring h-kit-control w-full min-w-0 rounded-kit-md bg-transparent px-2 text-body text-fg outline-none transition-colors duration-fast placeholder:text-fg-faint hover:bg-fill focus:bg-fill ${props.class ?? ""}`}
		/>
	);
}

/**
 * A password with a way to see what was typed: the eye inside the field's end flips it between
 * dots and text. Takes everything an input does, `type` aside.
 */
export function PasswordInput(
	props: Omit<JSX.InputHTMLAttributes<HTMLInputElement>, "type"> & Shape,
): JSX.Element {
	const [shown, setShown] = createSignal(false);
	const rest = omit(props, "class", "shape");
	const ref = focusOnArrival(props.autofocus);
	return (
		<div class={`relative ${props.class ?? ""}`}>
			<input
				{...rest}
				ref={ref}
				type={shown() ? "text" : "password"}
				class={props.shape === "pill" ? `${PILL} pr-12` : `${CONTROL} h-kit-control pr-11`}
			/>
			<button
				type="button"
				aria-label={shown() ? "Hide password" : "Show password"}
				aria-pressed={shown() ? "true" : "false"}
				onClick={() => setShown(!shown())}
				class={`focus-ring absolute inset-y-0 right-0 grid place-items-center text-fg-subtle hover:text-fg ${props.shape === "pill" ? "w-12 rounded-r-full" : "w-10 rounded-r-kit pointer-coarse:w-11"}`}
			>
				<Show when={shown()} fallback={<EyeIcon size="sm" />}>
					<EyeOffIcon size="sm" />
				</Show>
			</button>
		</div>
	);
}
