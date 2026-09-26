import type { JSX } from "@solidjs/web";

/** A steady hue per name, so a workspace keeps its colour everywhere without choosing one. */
function hueOf(name: string): number {
	let hash = 0;
	for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 360;
	return hash;
}

/**
 * A workspace's initial on its colour: the one place a workspace is told apart at a glance, in
 * the switcher and wherever it is named.
 */
export function WorkspaceMark(props: {
	name: string;
	color?: string | null;
	class?: string;
}): JSX.Element {
	const background = () =>
		props.color?.startsWith("#") ? props.color : `hsl(${hueOf(props.name)} 62% 52%)`;

	return (
		<span
			aria-hidden="true"
			class={`grid shrink-0 place-items-center rounded-md font-medium text-white uppercase ${props.class ?? "size-5 text-ui-xs"}`}
			style={{ background: background() }}
		>
			{props.name.trim().slice(0, 1) || "?"}
		</span>
	);
}
