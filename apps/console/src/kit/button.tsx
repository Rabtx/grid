import type { JSX } from "@solidjs/web";
import { Show, omit } from "solid-js";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "accent";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
	"focus-ring inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-kit font-medium transition-[background-color,color,box-shadow,transform] duration-fast ease-out-grid active:scale-[0.98] disabled:pointer-events-none";

const VARIANTS: Record<ButtonVariant, string> = {
	primary: "bg-inverse text-inverse-fg hover:bg-inverse/88 disabled:opacity-35",
	secondary:
		"bg-surface text-fg shadow-[inset_0_0_0_1px_var(--kit-line-strong)] hover:bg-fill disabled:text-fg-faint",
	ghost: "text-fg-muted hover:bg-fill hover:text-fg disabled:text-fg-faint",
	danger: "text-danger hover:bg-danger/8 disabled:opacity-40",
	accent: "bg-accent text-white hover:bg-accent/90 disabled:opacity-40",
};

const SIZES: Record<ButtonSize, string> = {
	sm: "h-kit-control-sm px-2.5 text-caption",
	md: "h-kit-control px-3 text-body",
	lg: "h-kit-control-lg px-4 text-body",
};

type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
	variant?: ButtonVariant;
	size?: ButtonSize;
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
			class={`${BASE} ${VARIANTS[props.variant ?? "secondary"]} ${SIZES[props.size ?? "md"]} ${props.class ?? ""}`}
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
	size?: "sm" | "md";
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
			class={`${BASE} ${props.size === "sm" ? "size-kit-control-sm" : "size-kit-control"} ${
				props.variant === "secondary"
					? VARIANTS.secondary
					: "text-fg-subtle hover:bg-fill hover:text-fg"
			} ${props.class ?? ""}`}
		>
			{props.children}
		</button>
	);
}
