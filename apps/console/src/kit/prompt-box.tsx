import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";

import { ICON_SIZE } from "./button";
import { Tooltip } from "./surface";

/**
 * Where you write to an agent: one raised, lit card with the text on top and a toolbar under it —
 * tools on the left, the model, the mic and send on the right — and, along its bottom edge, a
 * strip for context (the folder it works in, the branch). It glows in the accent while you type.
 * Chat owns the text and sending; this is its shape.
 */
export function PromptBox(props: {
	field: JSX.Element;
	attachments?: JSX.Element;
	onDragOver?: (event: DragEvent) => void;
	onDrop?: (event: DragEvent) => void;
	/** Left of the toolbar: attach, mode, project. */
	tools?: JSX.Element;
	/** Right of the toolbar, before send: the model, the mic. */
	options?: JSX.Element;
	send: JSX.Element;
	/** Under the card: where the agent works, the branch. */
	tray?: JSX.Element;
	/** Floats inside the card over the text: the @-mention list. */
	overlay?: JSX.Element;
	/** The card is a form: Enter-to-send and the send button submit it. */
	onSubmit?: (event: SubmitEvent) => void;
	/** The form element, for voice dictation to find its field. */
	formRef?: (form: HTMLFormElement) => void;
	class?: string;
}): JSX.Element {
	return (
		<div class={`relative flex flex-col ${props.class ?? ""}`}>
			{/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- file drop supplements the keyboard-accessible picker */}
			<form
				ref={(el) => props.formRef?.(el)}
				onDragOver={(event) => props.onDragOver?.(event)}
				onDrop={(event) => props.onDrop?.(event)}
				onSubmit={(event) => {
					event.preventDefault();
					props.onSubmit?.(event);
				}}
				class="relative z-10 flex flex-col rounded-kit-2xl bg-surface-raised shadow-raise transition-shadow duration-base ease-out-grid focus-within:shadow-focus"
			>
				{props.overlay}
				{props.field}
				<Show when={props.attachments}>
					<div class="flex flex-wrap gap-2 px-4 pb-3">{props.attachments}</div>
				</Show>
				<div class="flex items-center gap-1.5 px-3 pb-3">
					<div class="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
						{props.tools}
					</div>
					{props.options}
					{props.send}
				</div>
				<Show when={props.tray}>
					<div class="flex min-h-9 items-center gap-3 rounded-b-kit-2xl border-line border-t bg-fill px-4 text-body text-fg-subtle pointer-coarse:min-h-11">
						{props.tray}
					</div>
				</Show>
			</form>
		</div>
	);
}

/** The composer's text field: grows with its text, no chrome of its own. */
export const PROMPT_FIELD =
	"block max-h-52 min-h-16 w-full resize-none bg-transparent px-4 pt-4 pb-2 text-fg text-field outline-none placeholder:text-fg-faint";

/** A tool chip on the composer's toolbar: plus, a mode, a project. */
export const PROMPT_CHIP =
	"focus-ring inline-flex h-7 shrink-0 items-center gap-1.5 rounded-kit px-2 text-body-lg text-fg-muted transition-colors duration-fast hover:bg-fill hover:text-fg aria-expanded:bg-fill-strong pointer-coarse:h-10";

/** The bordered square at the start of the toolbar: add files, context, tools. */
export const PROMPT_ADD = `focus-ring grid size-7 shrink-0 place-items-center rounded-kit icon-tile text-fg-muted transition-colors duration-fast hover:text-fg pointer-coarse:size-10 ${ICON_SIZE.md}`;

/**
 * The round send button: a quiet, empty circle until there is something to send, then it fills
 * with ink and a lit edge, a little larger, as if it came forward.
 */
export const SEND_BUTTON =
	"focus-ring grid size-7 shrink-0 place-items-center rounded-full bg-inverse text-inverse-fg surface-primary transition-[background-color,color,box-shadow,scale] duration-base ease-out-grid active:scale-95 disabled:bg-fill-strong disabled:bg-none disabled:text-fg-faint disabled:shadow-none pointer-coarse:size-10";

/** Stop, in place of send while the agent works: a ring turns around it until it is done. */
export const STOP_BUTTON =
	"focus-ring relative grid size-7 shrink-0 place-items-center rounded-full bg-fill-strong text-fg transition-transform duration-fast active:scale-95 pointer-coarse:size-10";

/** The ring turning around the stop button while the agent works. */
export function WorkingRing(): JSX.Element {
	return (
		<span
			aria-hidden="true"
			class="pointer-events-none absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-accent [animation-duration:1.1s] motion-reduce:animate-none"
		/>
	);
}

/**
 * How full the agent's context is, as a small ring beside the model: quiet until it fills,
 * amber from 80%, red from 95%. The number is in its label and tooltip.
 */
export function ContextMeter(props: { used: number; total: number }): JSX.Element {
	const ratio = () => Math.min(1, Math.max(0, props.used / Math.max(1, props.total)));
	const percent = () => Math.round(ratio() * 100);
	const tone = () =>
		ratio() >= 0.95
			? "var(--signal-danger)"
			: ratio() >= 0.8
				? "var(--signal-warning)"
				: "var(--kit-fg-subtle)";
	const radius = 6;
	const around = 2 * Math.PI * radius;
	return (
		<Tooltip label={`${percent()}% of context used`}>
			<span class="grid size-7 shrink-0 place-items-center pointer-coarse:size-10">
				<span class="sr-only">{percent()}% of context used</span>
				<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" class="-rotate-90">
					<circle
						cx="8"
						cy="8"
						r={radius}
						fill="none"
						stroke="var(--kit-fill-strong)"
						stroke-width="2"
					/>
					<circle
						cx="8"
						cy="8"
						r={radius}
						fill="none"
						stroke={tone()}
						stroke-width="2"
						stroke-linecap="round"
						stroke-dasharray={String(around)}
						stroke-dashoffset={String(around * (1 - ratio()))}
						class="transition-[stroke-dashoffset] duration-slow ease-out-grid"
					/>
				</svg>
			</span>
		</Tooltip>
	);
}

/** The composer's mic: red while it listens. */
export const MIC_BUTTON = `focus-ring grid size-7 shrink-0 place-items-center rounded-kit icon-tile text-fg-muted transition-colors duration-fast hover:text-fg aria-pressed:bg-danger aria-pressed:text-white pointer-coarse:size-10 ${ICON_SIZE.md}`;

/** A round-cornered square icon button on the composer's toolbar: the mic, a tool. */
export const PROMPT_ICON = `focus-ring grid size-7 shrink-0 place-items-center rounded-kit icon-tile text-fg-muted transition-colors duration-fast hover:text-fg pointer-coarse:size-10 ${ICON_SIZE.md}`;

/**
 * Ways into a first message: chips that scroll sideways on phones (in thumb reach, above the
 * composer) and a quiet list on desktop (under it).
 */
export function Suggestions(props: {
	items: readonly { icon: JSX.Element; label: string }[];
	onPick: (label: string) => void;
	/** Layout only, e.g. `md:order-last` to sit under the composer on desktop. */
	class?: string;
}): JSX.Element {
	return (
		<ul
			class={`flex gap-2 overflow-x-auto [scrollbar-width:none] md:flex-col md:gap-0.5 md:px-1 ${props.class ?? ""}`}
		>
			<For each={props.items}>
				{(item) => (
					<li class="shrink-0">
						<button
							type="button"
							onClick={() => props.onPick(item.label)}
							class="focus-ring flex h-9 items-center gap-2.5 whitespace-nowrap rounded-full px-3 text-body text-fg-muted ring-line-strong transition-colors duration-fast hover:bg-fill hover:text-fg md:h-8 md:w-full md:rounded-kit md:px-2 md:shadow-none"
						>
							<span class="text-fg-subtle">{item.icon}</span>
							{item.label}
						</button>
					</li>
				)}
			</For>
		</ul>
	);
}
