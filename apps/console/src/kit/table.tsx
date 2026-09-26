import type { JSX } from "@solidjs/web";

/**
 * A data table: sticky quiet headers, hairline rows, hover on rows. The markup is plain table
 * elements so screens compose columns freely; on phones wrap it for horizontal scroll or swap it
 * for a list.
 */
export function Table(props: { children: JSX.Element; class?: string }): JSX.Element {
	return (
		<div class={`overflow-x-auto ${props.class ?? ""}`}>
			<table class="w-full border-separate border-spacing-0 text-body">{props.children}</table>
		</div>
	);
}

export function Th(props: {
	children?: JSX.Element;
	class?: string;
	align?: "left" | "right";
}): JSX.Element {
	return (
		<th
			scope="col"
			class={`sticky top-0 h-9 border-line border-b bg-surface px-3 font-normal text-caption text-fg-subtle whitespace-nowrap ${props.align === "right" ? "text-right" : "text-left"} ${props.class ?? ""}`}
		>
			{props.children}
		</th>
	);
}

export function Tr(props: {
	children: JSX.Element;
	selected?: boolean;
	onClick?: () => void;
}): JSX.Element {
	return (
		<tr
			onClick={() => props.onClick?.()}
			aria-selected={props.selected ? "true" : undefined}
			class={`group/row transition-colors duration-fast hover:bg-fill aria-selected:bg-fill-strong ${props.onClick ? "cursor-pointer" : ""}`}
		>
			{props.children}
		</tr>
	);
}

export function Td(props: {
	children?: JSX.Element;
	class?: string;
	align?: "left" | "right";
}): JSX.Element {
	return (
		<td
			class={`h-11 border-line border-b px-3 text-fg-muted whitespace-nowrap ${props.align === "right" ? "text-right tabular-nums" : ""} ${props.class ?? ""}`}
		>
			{props.children}
		</td>
	);
}
