import type { JSX } from "@solidjs/web";

/** A terminal's frame: dark whatever the theme, monospaced, the way a real one looks. */
export function Terminal(props: { children: JSX.Element; class?: string }): JSX.Element {
	return (
		<div
			class={`flex min-h-0 flex-col bg-terminal p-4 font-mono text-caption text-terminal-fg leading-6 ${props.class ?? ""}`}
		>
			{props.children}
		</div>
	);
}

const TONE = {
	default: "",
	dim: "text-terminal-dim",
	green: "text-terminal-green",
	blue: "text-terminal-blue",
} as const;

/** A run of terminal text in one of its colours. */
export function TermText(props: { tone?: keyof typeof TONE; children: JSX.Element }): JSX.Element {
	return <span class={TONE[props.tone ?? "default"]}>{props.children}</span>;
}
