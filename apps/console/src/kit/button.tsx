import type { JSX } from "@solidjs/web";
import { Show, omit } from "solid-js";

import { variants } from "./variants";

/** The button recipe: exported so links and triggers that must look like buttons share it. */
export const button = variants({
	base: "focus-ring inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-kit font-medium transition-[background-color,color,box-shadow,transform] duration-fast ease-out-grid active:scale-[0.98] disabled:pointer-events-none",
	variants: {
		variant: {
			primary:
				"surface-primary bg-inverse text-inverse-fg hover:bg-inverse/90 depth:active:translate-y-px disabled:opacity-35 disabled:shadow-none",
			secondary: "surface-outline text-fg hover:bg-fill disabled:text-fg-faint",
			ghost: "text-fg-muted hover:bg-fill hover:text-fg disabled:text-fg-faint",
			danger: "text-danger hover:bg-danger/8 disabled:opacity-40",
			accent:
				"surface-primary bg-accent text-white hover:bg-accent/90 depth:active:translate-y-px disabled:opacity-40 disabled:shadow-none",
		},
		size: {
			sm: "h-kit-control-sm px-2.5 text-caption",
			md: "h-kit-control px-3 text-body",
			lg: "h-kit-control-lg px-4 text-body",
		},
	},
	defaults: { variant: "secondary", size: "md" },
});

/**
 * An icon-only button. It sits on a tile (`icon-tile`) so it reads as a button, and it sets its
 * icon's size, so every icon in a button of one size is the same: 16px (14px in `xs`), 20px on
 * touch. `bare` drops the tile for an icon inside something that is already a control (a chip).
 */
export const ICON_SIZE = {
	xs: "[&_svg]:size-3.5 pointer-coarse:[&_svg]:size-4",
	sm: "[&_svg]:size-4 pointer-coarse:[&_svg]:size-5",
	md: "[&_svg]:size-4 pointer-coarse:[&_svg]:size-5",
} as const;

export const iconButton = variants({
	base: "focus-ring inline-grid shrink-0 select-none place-items-center rounded-kit transition-[background-color,color,transform] duration-fast ease-out-grid active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40",
	variants: {
		variant: {
			ghost:
				"icon-tile text-fg-muted hover:bg-fill-strong hover:text-fg aria-expanded:bg-fill-strong aria-expanded:text-fg",
			bare: "text-fg-subtle hover:bg-fill hover:text-fg",
			secondary: "surface-outline text-fg-muted hover:bg-fill hover:text-fg",
			danger: "icon-tile text-fg-subtle hover:bg-danger/10 hover:text-danger",
		},
		size: {
			xs: `size-6 pointer-coarse:size-10 ${ICON_SIZE.xs}`,
			sm: `size-kit-control-sm ${ICON_SIZE.sm}`,
			md: `size-kit-control ${ICON_SIZE.md}`,
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
				<kbd class="ml-0.5 rounded-kit-xs bg-current/12 px-1 font-kit font-normal text-caption leading-4 opacity-80">
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
	/** A tooltip other than the label, e.g. why it is disabled. */
	tooltip?: string;
	variant?: "ghost" | "bare" | "secondary" | "danger";
};

/** A square button holding one icon; its label is its name and tooltip. */
export function IconButton(props: IconButtonProps): JSX.Element {
	const rest = omit(props, "label", "size", "variant", "class", "children", "tooltip");
	return (
		<button
			type="button"
			aria-label={props.label}
			title={props.tooltip ?? props.label}
			{...rest}
			class={iconButton({ variant: props.variant, size: props.size, class: props.class })}
		>
			{props.children}
		</button>
	);
}

export const linkButton = variants({
	base: "focus-ring inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-kit-sm text-caption transition-colors duration-fast",
	variants: {
		tone: {
			subtle: "text-fg-subtle hover:text-fg-muted",
			accent: "text-link underline-offset-2 hover:underline",
		},
	},
	defaults: { tone: "subtle" },
});

/** A button that reads as text: a folder path to change, a quiet inline action. */
export function LinkButton(
	props: JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
		tone?: "subtle" | "accent";
		icon?: JSX.Element;
	},
): JSX.Element {
	const rest = omit(props, "tone", "icon", "class", "children");
	return (
		<button type="button" {...rest} class={linkButton({ tone: props.tone, class: props.class })}>
			{props.icon}
			<span class="min-w-0 truncate">{props.children}</span>
		</button>
	);
}

/** A link that reads like `LinkButton`: going somewhere (an open chat) rather than doing something. */
export function TextLink(
	props: JSX.AnchorHTMLAttributes<HTMLAnchorElement> & {
		tone?: "subtle" | "accent";
		icon?: JSX.Element;
	},
): JSX.Element {
	const rest = omit(props, "tone", "icon", "class", "children");
	return (
		<a {...rest} class={linkButton({ tone: props.tone, class: props.class })}>
			{props.icon}
			<span class="min-w-0 truncate">{props.children}</span>
		</a>
	);
}
