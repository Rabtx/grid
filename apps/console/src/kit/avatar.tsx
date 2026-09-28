import type { JSX } from "@solidjs/web";

/** A steady hue per name, so a person or workspace keeps its colour without choosing one. */
export function hueOf(name: string): number {
	let hash = 0;
	for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 360;
	return hash;
}

const SIZES = {
	xs: "size-4 text-micro",
	sm: "size-5 text-micro",
	md: "size-6 text-caption",
	lg: "size-8 text-body",
};

/** Nobody yet: a dashed ring where an avatar would be, for unassigned work. */
export function NobodyMark(props: { size?: keyof typeof SIZES }): JSX.Element {
	return (
		<span
			aria-hidden="true"
			class={`shrink-0 rounded-full border border-line-strong border-dashed ${SIZES[props.size ?? "md"]}`}
		/>
	);
}

/** A person: their initial on a soft tint of their colour. */
export function Avatar(props: { name: string; size?: keyof typeof SIZES }): JSX.Element {
	return (
		<span
			aria-hidden="true"
			class={`grid shrink-0 place-items-center rounded-full font-medium uppercase ${SIZES[props.size ?? "md"]}`}
			style={{
				background: `hsl(${hueOf(props.name)} 70% 92%)`,
				color: `hsl(${hueOf(props.name)} 45% 32%)`,
			}}
		>
			{props.name.trim().slice(0, 1) || "?"}
		</span>
	);
}

/** A workspace: its initial on its colour, square-ish, like an app icon. */
export function WorkspaceMark(props: {
	name: string;
	color?: string | null;
	size?: keyof typeof SIZES;
}): JSX.Element {
	return (
		<span
			aria-hidden="true"
			class={`grid shrink-0 place-items-center rounded-[28%] font-semibold text-white uppercase ${SIZES[props.size ?? "sm"]}`}
			style={{
				background: props.color?.startsWith("#")
					? props.color
					: `hsl(${hueOf(props.name)} 62% 52%)`,
			}}
		>
			{props.name.trim().slice(0, 1) || "?"}
		</span>
	);
}

/** A few people at a glance: overlapping avatars and a count for the rest. */
export function AvatarGroup(props: { names: readonly string[]; max?: number }): JSX.Element {
	const shown = () => props.names.slice(0, props.max ?? 3);
	const rest = () => props.names.length - shown().length;
	return (
		<span class="flex items-center -space-x-1.5">
			{shown().map((name) => (
				<span class="rounded-full ring-2 ring-surface">
					<Avatar name={name} size="sm" />
				</span>
			))}
			{rest() > 0 ? (
				<span class="grid size-5 place-items-center rounded-full bg-fill-strong text-micro text-fg-subtle ring-2 ring-surface">
					+{rest()}
				</span>
			) : null}
		</span>
	);
}

const PROVIDER = {
	anthropic: "bg-provider-anthropic",
	openai: "bg-provider-openai",
	google: "bg-provider-google",
	other: "bg-provider-other",
} as const;

export type Provider = keyof typeof PROVIDER;

/** Which company's model: a dot in its colour, beside the model's name. */
export function ProviderMark(props: { provider: Provider }): JSX.Element {
	return (
		<span aria-hidden="true" class={`size-2 shrink-0 rounded-full ${PROVIDER[props.provider]}`} />
	);
}

/**
 * An agent (Claude Code, Codex…) or a lab as its initial in a small tile tinted its own colour,
 * lit along the top edge, so each reads apart at a glance. The tint follows the theme.
 */
export function AgentMark(props: { name: string; size?: "sm" | "md" | "lg" }): JSX.Element {
	const hue = () => hueOf(props.name.trim().toLowerCase());
	return (
		<span
			aria-hidden="true"
			class={`grid shrink-0 place-items-center font-semibold uppercase leading-none ${props.size === "lg" ? "size-6 rounded-[6px] text-caption" : props.size === "md" ? "size-4 rounded-[4px] text-micro" : "size-3.5 rounded-[4px] text-micro"}`}
			style={{
				background: `color-mix(in srgb, hsl(${hue()} 70% 55%) 18%, transparent)`,
				color: `color-mix(in oklab, hsl(${hue()} 70% 55%) 70%, var(--ink))`,
				"box-shadow": `inset 0 1px 0 var(--kit-highlight), inset 0 0 0 1px color-mix(in srgb, hsl(${hue()} 70% 55%) 26%, transparent)`,
			}}
		>
			{props.name.trim().slice(0, 1)}
		</span>
	);
}
