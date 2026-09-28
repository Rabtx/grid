import type { JSX } from "@solidjs/web";
import { Dynamic } from "@solidjs/web";

import { variants } from "./variants";

const text = variants({
	base: "",
	variants: {
		size: {
			micro: "text-micro",
			caption: "text-caption",
			body: "text-body",
			"body-lg": "text-body-lg",
			heading: "text-heading",
			headline: "text-headline",
			display: "text-display",
			inherit: "",
		},
		tone: {
			strong: "text-fg",
			default: "text-fg-muted",
			subtle: "text-fg-subtle",
			faint: "text-fg-faint",
			accent: "text-accent",
			success: "text-success",
			warning: "text-warning",
			danger: "text-danger",
			inverse: "text-inverse-fg",
			inherit: "",
		},
		weight: { regular: "", medium: "font-medium" },
	},
	defaults: { size: "body", tone: "default", weight: "regular" },
});

export type TextSize =
	| "micro"
	| "caption"
	| "body"
	| "body-lg"
	| "heading"
	| "headline"
	| "display"
	| "inherit";
export type TextTone =
	| "strong"
	| "default"
	| "subtle"
	| "faint"
	| "accent"
	| "success"
	| "warning"
	| "danger"
	| "inverse"
	| "inherit";

/**
 * All text in screens: a size from the scale, a tone from the ladder (strong for what you look at,
 * default for body, subtle for metadata, faint for placeholders), regular or medium.
 */
export function Text(props: {
	size?: TextSize;
	tone?: TextTone;
	weight?: "regular" | "medium";
	as?: "p" | "span" | "div" | "label" | "h1" | "h2" | "h3" | "h4";
	truncate?: boolean;
	mono?: boolean;
	tabular?: boolean;
	/** Keep the line breaks it was written with (a prompt, a message), wrapping long words. */
	lines?: boolean;
	/** Layout only. */
	class?: string;
	children: JSX.Element;
}): JSX.Element {
	return (
		<Dynamic
			component={props.as ?? "p"}
			class={text({
				size: props.size,
				tone: props.tone,
				weight: props.weight,
				class: `${props.truncate ? "min-w-0 truncate" : ""} ${props.mono ? "font-mono" : ""} ${props.tabular ? "tabular-nums" : ""} ${props.lines ? "whitespace-pre-wrap break-words" : ""} ${props.class ?? ""}`,
			})}
		>
			{props.children}
		</Dynamic>
	);
}

const LEVEL = { 1: "display", 2: "headline", 3: "heading", 4: "body-lg" } as const;

/** A heading at one of four levels, medium weight in strong ink. */
export function Heading(props: {
	level?: 1 | 2 | 3 | 4;
	class?: string;
	children: JSX.Element;
}): JSX.Element {
	const level = () => props.level ?? 2;
	return (
		<Text
			as={`h${level()}` as "h1"}
			size={LEVEL[level()]}
			tone="strong"
			weight="medium"
			class={props.class}
		>
			{props.children}
		</Text>
	);
}

/** A command, a key or a path inside a sentence, set in mono on a soft chip. */
export function Code(props: { children: JSX.Element }): JSX.Element {
	return (
		<code class="rounded-kit-sm bg-fill px-1 py-0.5 font-mono text-caption text-fg-muted">
			{props.children}
		</code>
	);
}
