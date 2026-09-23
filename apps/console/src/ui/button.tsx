import type { JSX } from "@solidjs/web";
import { omit } from "solid-js";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const BASE =
	"focus-ring inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-[background-color,color,transform] duration-fast ease-out-grid active:scale-[0.97] disabled:pointer-events-none";

// Primary is an ink inversion — white on dark, ink on light — never a brand colour.
const VARIANT: Record<ButtonVariant, string> = {
	primary: "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-30",
	secondary: "border border-ink/10 text-ink/70 hover:bg-ink/10 hover:text-ink disabled:text-ink/35",
	ghost: "text-ink/70 hover:bg-ink/8 hover:text-ink disabled:text-ink/35",
	danger: "text-danger hover:bg-danger/10 disabled:opacity-40",
};

const SIZE: Record<ButtonSize, string> = {
	sm: "h-6 px-2 text-ui-xs",
	md: "h-control px-2.5 text-ui-sm",
	lg: "h-field px-3 text-ui",
};

type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
	variant?: ButtonVariant;
	size?: ButtonSize;
};

/** The console's button: `primary` for the one main action on a surface, `secondary` otherwise. */
export function Button(props: ButtonProps): JSX.Element {
	const rest = omit(props, "variant", "size", "class", "type");
	return (
		<button
			type={props.type ?? "button"}
			class={`${BASE} ${VARIANT[props.variant ?? "secondary"]} ${SIZE[props.size ?? "md"]} ${props.class ?? ""}`}
			{...rest}
		/>
	);
}

type IconButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
	/** Required: an icon-only control has no visible text to name it. */
	label: string;
	size?: "sm" | "md";
};

/** A square, icon-only ghost button; tertiary ink at rest, full ink on hover. */
export function IconButton(props: IconButtonProps): JSX.Element {
	const rest = omit(props, "label", "size", "class", "type");
	const size = () => (props.size === "sm" ? "size-6" : "size-control");
	return (
		<button
			type={props.type ?? "button"}
			aria-label={props.label}
			title={props.label}
			class={`focus-ring grid shrink-0 place-items-center rounded-md text-ink/50 transition-[background-color,color,transform] duration-fast ease-out-grid hover:bg-ink/8 hover:text-ink active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40 ${size()} ${props.class ?? ""}`}
			{...rest}
		/>
	);
}
