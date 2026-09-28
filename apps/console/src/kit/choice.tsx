import type { JSX } from "@solidjs/web";
import { createUniqueId, For, Show } from "solid-js";

import { tap } from "./haptics";

export type RadioOption<T extends string> = {
	value: T;
	label: string;
	description?: string;
	icon?: JSX.Element;
};

/** One of a few, each explained: a card per option with the choice ringed. */
export function RadioCards<T extends string>(props: {
	label: string;
	options: readonly RadioOption<T>[];
	value: T;
	onChange: (value: T) => void;
	columns?: 1 | 2 | 3;
}): JSX.Element {
	const name = createUniqueId();
	return (
		<fieldset
			class={`grid min-w-0 gap-2 border-0 p-0 ${props.columns === 3 ? "md:grid-cols-3" : props.columns === 2 ? "md:grid-cols-2" : ""}`}
		>
			<legend class="sr-only">{props.label}</legend>
			<For each={props.options}>
				{(option) => (
					<label
						aria-label={option.label}
						class="relative flex cursor-pointer items-start gap-3 rounded-kit-lg bg-surface p-3.5 ring-line-strong transition-shadow duration-fast hover:bg-fill has-checked:ring-selected has-focus-visible:outline-2 has-focus-visible:outline-accent"
					>
						<input
							type="radio"
							name={name}
							value={option.value}
							checked={props.value === option.value}
							onChange={() => {
								tap();
								props.onChange(option.value);
							}}
							class="peer sr-only"
						/>
						<Show when={option.icon}>
							<span class="mt-0.5 grid size-5 shrink-0 place-items-center text-fg-subtle peer-checked:text-fg">
								{option.icon}
							</span>
						</Show>
						<span class="flex min-w-0 flex-1 flex-col gap-0.5">
							<span class="font-medium text-body text-fg">{option.label}</span>
							<Show when={option.description}>
								<span class="text-body text-fg-subtle">{option.description}</span>
							</Show>
						</span>
						<span class="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full ring-line-strong peer-checked:bg-inverse peer-checked:shadow-none after:size-1.5 after:rounded-full after:bg-inverse-fg after:opacity-0 peer-checked:after:opacity-100" />
					</label>
				)}
			</For>
		</fieldset>
	);
}

/** A value on a range: the interface scale, a tint. */
export function Slider(props: {
	label: string;
	value: number;
	min: number;
	max: number;
	step?: number;
	onChange: (value: number) => void;
	format?: (value: number) => string;
	/** Label, a short track and the value on one line, for toolbars. */
	inline?: boolean;
	/** Named elsewhere (a settings row): the label is for screen readers, the value sits beside the track. */
	labelHidden?: boolean;
}): JSX.Element {
	const id = createUniqueId();
	const percent = () => ((props.value - props.min) / (props.max - props.min)) * 100;
	const input = () => (
		<input
			id={id}
			type="range"
			aria-label={props.label}
			min={props.min}
			max={props.max}
			step={props.step ?? 1}
			value={props.value}
			onInput={(event) => props.onChange(Number(event.currentTarget.value))}
			style={{ "--fill": `${percent()}%` }}
			class={`kit-slider h-5 cursor-pointer appearance-none bg-transparent ${props.inline ? "w-24" : "w-full"}`}
		/>
	);
	if (props.inline)
		return (
			<div class="flex items-center gap-2 text-caption">
				<label for={id} class="text-fg-subtle">
					{props.label}
				</label>
				{input()}
				<span class="w-8 text-fg tabular-nums">
					{props.format ? props.format(props.value) : props.value}
				</span>
			</div>
		);
	if (props.labelHidden)
		return (
			<div class="flex items-center gap-3">
				<label for={id} class="sr-only">
					{props.label}
				</label>
				{input()}
				<span class="w-11 shrink-0 text-right text-body text-fg-subtle tabular-nums">
					{props.format ? props.format(props.value) : props.value}
				</span>
			</div>
		);
	return (
		<div class="flex flex-col gap-2">
			<div class="flex items-center justify-between text-body">
				<label for={id} class="text-fg">
					{props.label}
				</label>
				<span class="text-fg-subtle tabular-nums">
					{props.format ? props.format(props.value) : props.value}
				</span>
			</div>
			{input()}
		</div>
	);
}

/** One of several, as chips that wrap: a task's stage when making it. */
export function ChoiceChips<T extends string>(props: {
	label: string;
	options: readonly { value: T; label: string; icon?: JSX.Element }[];
	value: T;
	onChange: (value: T) => void;
}): JSX.Element {
	return (
		<fieldset class="flex min-w-0 flex-col gap-2 border-0 p-0">
			<legend class="mb-2 font-medium text-body text-fg">{props.label}</legend>
			<div class="flex flex-wrap gap-1.5">
				<For each={props.options}>
					{(option) => (
						<button
							type="button"
							aria-pressed={props.value === option.value ? "true" : "false"}
							onClick={() => {
								tap();
								props.onChange(option.value);
							}}
							class="focus-ring inline-flex h-7 items-center gap-1.5 rounded-kit px-2 text-body text-fg-subtle ring-line-strong transition-colors duration-fast hover:text-fg aria-pressed:bg-fill-strong aria-pressed:text-fg pointer-coarse:h-10"
						>
							{option.icon}
							{option.label}
						</button>
					)}
				</For>
			</div>
		</fieldset>
	);
}

/**
 * A colour from a palette, "Automatic" first and a custom colour last: round swatches, the chosen
 * one ringed. `null` is automatic; a custom colour is a hex value.
 */
export function ColorSwatches(props: {
	label: string;
	options: readonly { id: string; value: string }[];
	value: string | null;
	onChange: (value: string | null) => void;
	/** Named elsewhere (a settings row): the legend is for screen readers only. */
	labelHidden?: boolean;
}): JSX.Element {
	const custom = () => (props.value?.startsWith("#") ? props.value : null);
	const SWATCH =
		"focus-ring size-7 rounded-full aria-pressed:ring-2 aria-pressed:ring-fg aria-pressed:ring-offset-2 aria-pressed:ring-offset-surface-raised pointer-coarse:size-8";
	return (
		<fieldset class="flex min-w-0 flex-col gap-2 border-0 p-0">
			<legend class={props.labelHidden ? "sr-only" : "mb-2 font-medium text-body text-fg"}>
				{props.label}
			</legend>
			<div class="flex flex-wrap items-center gap-2 pointer-coarse:gap-1.5">
				<button
					type="button"
					aria-pressed={props.value === null ? "true" : "false"}
					title="Automatic"
					onClick={() => {
						tap();
						props.onChange(null);
					}}
					class={`${SWATCH} grid place-items-center border border-line-strong border-dashed text-caption text-fg-subtle`}
				>
					A
				</button>
				<For each={props.options}>
					{(swatch) => (
						<button
							type="button"
							aria-label={swatch.id}
							title={swatch.id}
							aria-pressed={props.value === swatch.id ? "true" : "false"}
							onClick={() => {
								tap();
								props.onChange(swatch.id);
							}}
							class={SWATCH}
							style={{ background: swatch.value }}
						/>
					)}
				</For>
				<label
					title="Custom colour"
					class={`${SWATCH} relative cursor-pointer overflow-hidden ring-line-strong focus-within:ring-2 focus-within:ring-fg ${custom() ? "ring-2 ring-fg ring-offset-2 ring-offset-surface-raised" : ""}`}
					style={{
						background:
							custom() ??
							"conic-gradient(from 90deg, #ef4444, #f59e0b, #10b981, #3b82f6, #8b5cf6, #ef4444)",
					}}
				>
					<input
						type="color"
						aria-label="Custom colour"
						value={custom() ?? "#4d9ef5"}
						onInput={(event) => props.onChange(event.currentTarget.value)}
						class="absolute inset-0 cursor-pointer opacity-0"
					/>
				</label>
			</div>
		</fieldset>
	);
}

/**
 * One glyph of many, as square tiles tinted in `color` (a project's icon, say). `wide` tiles also
 * name the choice beside its glyph.
 */
export function GlyphChoices<T extends string>(props: {
	label: string;
	options: readonly { value: T; label: string; glyph: JSX.Element }[];
	value: T | null;
	onChange: (value: T) => void;
	color?: string;
	wide?: boolean;
}): JSX.Element {
	return (
		<fieldset class="flex min-w-0 flex-wrap gap-1 border-0 p-0" style={{ color: props.color }}>
			<legend class="sr-only">{props.label}</legend>
			<For each={props.options}>
				{(option) => (
					<button
						type="button"
						aria-label={props.wide ? undefined : option.label}
						title={option.label}
						aria-pressed={props.value === option.value ? "true" : "false"}
						onClick={() => {
							tap();
							props.onChange(option.value);
						}}
						class={`focus-ring grid place-items-center rounded-kit-md transition-colors duration-fast hover:bg-fill aria-pressed:bg-fill-strong aria-pressed:ring-line-strong ${props.wide ? "h-9 grid-flow-col gap-1.5 px-3 text-body text-fg pointer-coarse:h-11" : "size-9 pointer-coarse:size-11"}`}
					>
						{option.glyph}
						<Show when={props.wide}>
							<span>{option.label}</span>
						</Show>
					</button>
				)}
			</For>
		</fieldset>
	);
}
