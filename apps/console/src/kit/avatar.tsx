import type { JSX } from "@solidjs/web";
import { createSignal, Show } from "solid-js";

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
	xl: "size-12 text-body-lg",
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

/** A person: their photo, or their initials on a soft tint of their colour. */
/** "Shabir Khan" → "SK", "ana" → "A": the first letters of the first two words. */
export function initials(name: string): string {
	const words = name
		.trim()
		.split(/[\s._-]+/)
		.filter(Boolean);
	return (
		words
			.slice(0, 2)
			.map((word) => word.slice(0, 1))
			.join("") || "?"
	);
}

export function Avatar(props: {
	name: string;
	size?: keyof typeof SIZES;
	/** Their photo, when they have one. */
	src?: string | null;
}): JSX.Element {
	// A photo that will not load (moved, or its server is down) falls back to the initials.
	const [broken, setBroken] = createSignal<string | null>(null);
	return (
		<Show
			when={props.src && props.src !== broken() ? props.src : null}
			fallback={
				<span
					aria-hidden="true"
					class={`grid shrink-0 place-items-center rounded-full font-medium uppercase ${SIZES[props.size ?? "md"]}`}
					style={{
						background: `hsl(${hueOf(props.name)} 70% 92%)`,
						color: `hsl(${hueOf(props.name)} 45% 32%)`,
					}}
				>
					{props.size === "xs" || props.size === "sm"
						? initials(props.name).slice(0, 1)
						: initials(props.name)}
				</span>
			}
		>
			{(src) => (
				<img
					src={src()}
					alt=""
					onError={() => setBroken(src())}
					class={`shrink-0 rounded-full object-cover ${SIZES[props.size ?? "md"]}`}
				/>
			)}
		</Show>
	);
}

/** A workspace: its initial on its colour, square-ish, like an app icon. */
export function WorkspaceMark(props: {
	name: string;
	color?: string | null;
	size?: keyof typeof SIZES;
	/** Its uploaded logo, drawn instead of the letter. */
	src?: string | null;
}): JSX.Element {
	const corner = "rounded-[calc(28%*var(--kit-radius-scale))]";
	return (
		<Show
			when={props.src}
			fallback={
				<span
					aria-hidden="true"
					class={`grid shrink-0 place-items-center ${corner} font-semibold text-white uppercase ${SIZES[props.size ?? "sm"]}`}
					style={{
						background: props.color?.startsWith("#")
							? props.color
							: `hsl(${hueOf(props.name)} 62% 52%)`,
					}}
				>
					{props.name.trim().slice(0, 1) || "?"}
				</span>
			}
		>
			{(src) => (
				<img
					src={src()}
					alt=""
					class={`shrink-0 object-cover ${corner} ${SIZES[props.size ?? "sm"]}`}
				/>
			)}
		</Show>
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
			class={`grid shrink-0 place-items-center font-semibold uppercase leading-none ${props.size === "lg" ? "size-6 rounded-kit-sm text-caption" : props.size === "md" ? "size-4 rounded-kit-xs text-micro" : "size-3.5 rounded-kit-xs text-micro"}`}
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

/** The agents Grid knows by their own logo (Figma 00 · Brand, Agent logos). */
const AGENT_LOGOS: Record<string, string> = {
	codex: "/agents/codex.svg",
	antigravity: "/agents/antigravity.svg",
};

/**
 * An agent by its own logo where Grid has it (Claude Code, Codex, opencode, Antigravity), and by
 * its initial otherwise. Claude Code and opencode are drawn inline so they follow the theme.
 */
export function AgentLogo(props: { id: string; name: string; class?: string }): JSX.Element {
	const size = () => props.class ?? "size-4";
	if (props.id === "claude") {
		return (
			<svg viewBox="0 0 24 24" aria-hidden="true" class={`shrink-0 ${size()}`}>
				<path
					fill-rule="evenodd"
					d="M20.998 10.949H24V14.051H21V17.079H19.513V20H18V17.079H16.513V20H15V17.079H9V20H7.488V17.079H6V20H4.487V17.079H3V14.05H0V10.95H3V5H20.998V10.949ZM6 10.949H7.488V8.102H6V10.949ZM16.51 10.949H18V8.102H16.51V10.949Z"
					class="fill-provider-anthropic"
				/>
			</svg>
		);
	}
	if (props.id === "opencode") {
		return (
			<svg viewBox="0 0 24 24" aria-hidden="true" class={`shrink-0 ${size()}`}>
				<path fill-rule="evenodd" d="M16 6H8V18H16V6ZM20 22H4V2H20V22Z" class="fill-fg" />
			</svg>
		);
	}
	const src = AGENT_LOGOS[props.id];
	if (src) {
		return <img src={src} alt="" aria-hidden="true" class={`shrink-0 ${size()}`} />;
	}
	return (
		<span class="font-medium text-caption text-fg-muted uppercase">
			{props.name.trim().slice(0, 2)}
		</span>
	);
}
