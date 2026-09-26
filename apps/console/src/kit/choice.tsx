import type { JSX } from "@solidjs/web";
import { createUniqueId, For, Show } from "solid-js";

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
							onChange={() => props.onChange(option.value)}
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
}): JSX.Element {
	const id = createUniqueId();
	const percent = () => ((props.value - props.min) / (props.max - props.min)) * 100;
	const input = () => (
		<input
			id={id}
			type="range"
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
