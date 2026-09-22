import type { JSX } from "@solidjs/web";

/** Stroke icons drawn in `currentColor`; decorative, so hidden from assistive tech. */
function Icon(props: { class?: string; path: string }): JSX.Element {
	return (
		<svg
			class={props.class ?? "size-5"}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d={props.path} />
		</svg>
	);
}

export function MenuIcon(props: { class?: string }): JSX.Element {
	return <Icon class={props.class} path="M4 7h16M4 12h16M4 17h16" />;
}

export function CloseIcon(props: { class?: string }): JSX.Element {
	return <Icon class={props.class} path="M18 6 6 18M6 6l12 12" />;
}

export function PlusIcon(props: { class?: string }): JSX.Element {
	return <Icon class={props.class} path="M12 5v14M5 12h14" />;
}
