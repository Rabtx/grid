import type { JSX } from "@solidjs/web";
import { createSignal, Show } from "solid-js";

import { CheckIcon, CopyIcon } from "./icons";

/** A titled block of settings: a heading and description, then its rows in one card. */
export function SettingsGroup(props: {
	title: string;
	description?: string;
	action?: JSX.Element;
	children: JSX.Element;
}): JSX.Element {
	return (
		<section class="flex flex-col gap-3">
			<div class="flex items-end justify-between gap-3">
				<div>
					<h2 class="font-medium text-body-lg text-fg">{props.title}</h2>
					<Show when={props.description}>
						<p class="text-body text-fg-subtle">{props.description}</p>
					</Show>
				</div>
				{props.action}
			</div>
			<div class="divide-y divide-line rounded-kit-lg bg-surface ring-line">{props.children}</div>
		</section>
	);
}

/** One setting: what it is and what it does on the left, its control on the right (under it on phones). */
export function SettingsRow(props: {
	label: string;
	description?: string;
	children: JSX.Element;
	/** Keep the control beside the text even on phones (a switch). */
	inline?: boolean;
}): JSX.Element {
	return (
		<div
			class={`flex gap-3 px-4 py-3.5 ${props.inline ? "items-center" : "flex-col md:flex-row md:items-center"}`}
		>
			<div class="min-w-0 flex-1">
				<p class="text-body text-fg">{props.label}</p>
				<Show when={props.description}>
					<p class="text-body text-fg-subtle">{props.description}</p>
				</Show>
			</div>
			<div class="flex shrink-0 items-center gap-2">{props.children}</div>
		</div>
	);
}

/** A value to hand on (an invite link, a key): shown read-only with a copy button. */
export function CopyField(props: {
	value: string;
	label: string;
	icon?: JSX.Element;
	mono?: boolean;
}): JSX.Element {
	const [copied, setCopied] = createSignal(false);
	return (
		<div class="flex h-kit-control min-w-0 items-center gap-2 rounded-kit bg-fill pr-1 pl-3 ring-line">
			<Show when={props.icon}>
				<span class="shrink-0 text-fg-subtle">{props.icon}</span>
			</Show>
			<input
				readonly
				aria-label={props.label}
				value={props.value}
				onFocus={(event) => event.currentTarget.select()}
				class={`min-w-0 flex-1 bg-transparent text-body text-fg-muted outline-none ${props.mono ? "font-mono text-caption" : ""}`}
			/>
			<button
				type="button"
				aria-label={copied() ? "Copied" : `Copy ${props.label}`}
				onClick={() => {
					void navigator.clipboard?.writeText(props.value);
					setCopied(true);
					setTimeout(() => setCopied(false), 1400);
				}}
				class="focus-ring grid size-kit-control-sm shrink-0 place-items-center rounded-kit-sm text-fg-subtle hover:bg-fill-strong hover:text-fg"
			>
				<Show when={copied()} fallback={<CopyIcon class="size-4" />}>
					<CheckIcon class="size-4 text-success" />
				</Show>
			</button>
		</div>
	);
}
