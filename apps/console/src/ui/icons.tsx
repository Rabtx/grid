import type { JSX } from "@solidjs/web";

/**
 * The console's one icon set: outline glyphs on a 24px grid, one stroke weight, drawn in
 * `currentColor` so they take their label's ink. Decorative, so hidden from assistive tech;
 * the control carrying the icon owns the accessible name. Default size fits a 28px control.
 */
function Icon(props: { class?: string; children: JSX.Element }): JSX.Element {
	return (
		<svg
			class={props.class ?? "size-4"}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.75"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			{props.children}
		</svg>
	);
}

type IconProps = { class?: string };

export function MenuIcon(props: IconProps): JSX.Element {
	return (
		<Icon class={props.class}>
			<path d="M4 7h16M4 12h16M4 17h16" />
		</Icon>
	);
}

export function CloseIcon(props: IconProps): JSX.Element {
	return (
		<Icon class={props.class}>
			<path d="M18 6 6 18M6 6l12 12" />
		</Icon>
	);
}

export function PlusIcon(props: IconProps): JSX.Element {
	return (
		<Icon class={props.class}>
			<path d="M12 5v14M5 12h14" />
		</Icon>
	);
}

export function SearchIcon(props: IconProps): JSX.Element {
	return (
		<Icon class={props.class}>
			<circle cx="11" cy="11" r="6.5" />
			<path d="m20 20-4.2-4.2" />
		</Icon>
	);
}

export function CheckIcon(props: IconProps): JSX.Element {
	return (
		<Icon class={props.class}>
			<path d="m5 12.5 4.5 4.5L19 7.5" />
		</Icon>
	);
}

export function AlertIcon(props: IconProps): JSX.Element {
	return (
		<Icon class={props.class}>
			<circle cx="12" cy="12" r="8.5" />
			<path d="M12 7.5v5.5M12 16.5v.01" />
		</Icon>
	);
}

export function BoardIcon(props: IconProps): JSX.Element {
	return (
		<Icon class={props.class}>
			<rect x="3.5" y="4.5" width="17" height="15" rx="2" />
			<path d="M9.5 4.5v15M15.5 4.5v9" />
		</Icon>
	);
}

export function SignOutIcon(props: IconProps): JSX.Element {
	return (
		<Icon class={props.class}>
			<path d="M14 4.5h3.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H14M10 16l-4-4 4-4M6 12h9.5" />
		</Icon>
	);
}
