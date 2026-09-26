import type { JSX } from "@solidjs/web";
import { Show, omit } from "solid-js";

import { variants } from "./variants";

/** The button recipe: exported so links and triggers that must look like buttons share it. */
export const button = variants({
	base: "focus-ring inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-kit font-medium transition-[background-color,color,box-shadow,transform] duration-fast ease-out-grid active:scale-[0.98] disabled:pointer-events-none",
	variants: {
		variant: {
			primary: "bg-inverse text-inverse-fg hover:bg-inverse/88 disabled:opacity-35",
			secondary: "surface-outline text-fg hover:bg-fill disabled:text-fg-faint",
			ghost: "text-fg-muted hover:bg-fill hover:text-fg disabled:text-fg-faint",
			danger: "text-danger hover:bg-danger/8 disabled:opacity-40",
			accent: "bg-accent text-white hover:bg-accent/90 disabled:opacity-40",
		},
		size: {
			sm: "h-kit-control-sm px-2.5 text-caption",
			md: "h-kit-control px-3 text-body",
			lg: "h-kit-control-lg px-4 text-body",
		},
	},
	defaults: { variant: "secondary", size: "md" },
});

const iconButton = variants({
	base: "focus-ring inline-grid shrink-0 select-none place-items-center rounded-kit transition-[background-color,color,transform] duration-fast ease-out-grid active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40",
	variants: {
		variant: {
			ghost: "text-fg-subtle hover:bg-fill hover:text-fg",
			secondary: "surface-outline text-fg-muted hover:bg-fill hover:text-fg",
		},
		size: {
			xs: "size-6 pointer-coarse:size-10",
			sm: "size-kit-control-sm",
			md: "size-kit-control",
		},
	},
	defaults: { variant: "ghost", size: "md" },
});

type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
	variant?: "primary" | "secondary" | "ghost" | "danger" | "accent";
	size?: "sm" | "md" | "lg";
	/** An icon before the label. */
	icon?: JSX.Element;
	/** A keyboard hint after the label, e.g. ↵ or Esc. */
	kbd?: string;
};

/** The one button: a dark primary, a bordered secondary, a quiet ghost, danger and accent. */
export function Button(props: ButtonProps): JSX.Element {
	const rest = omit(props, "variant", "size", "icon", "kbd", "class", "children");
	return (
		<button
			type="button"
			{...rest}
			class={button({ variant: props.variant, size: props.size, class: props.class })}
		>
			{props.icon}
			{props.children}
			<Show when={props.kbd}>
				<kbd class="ml-0.5 rounded-[4px] bg-current/12 px-1 font-kit font-normal text-caption leading-4 opacity-80">
					{props.kbd}
				</kbd>
			</Show>
		</button>
	);
}

type IconButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
	/** The accessible name, also the tooltip. */
	label: string;
	/** xs is a 24px glyph button inside rows and headers (44px on touch). */
	size?: "xs" | "sm" | "md";
	variant?: "ghost" | "secondary";
};

/** A square button holding one icon; its label is its name and tooltip. */
export function IconButton(props: IconButtonProps): JSX.Element {
	const rest = omit(props, "label", "size", "variant", "class", "children");
	return (
		<button
			type="button"
			aria-label={props.label}
			title={props.label}
			{...rest}
			class={iconButton({ variant: props.variant, size: props.size, class: props.class })}
		>
			{props.children}
		</button>
	);
}
