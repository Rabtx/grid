import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";

export type TabOption<T extends string> = {
	value: T;
	label: string;
	icon?: JSX.Element;
	count?: number;
	/** alert (the default) is the red attention badge; quiet is a plain number, like a lane's size. */
	countTone?: "alert" | "quiet";
	/** The element this segment shows, for aria-controls. */
	controls?: string;
};

/** Underlined tabs across a panel: sections of one thing (Companies · People · Investors). */
export function Tabs<T extends string>(props: {
	label: string;
	options: readonly TabOption<T>[];
	value: T;
	onChange: (value: T) => void;
	class?: string;
}): JSX.Element {
	return (
		<div
			role="tablist"
			aria-label={props.label}
			class={`flex items-center gap-5 overflow-x-auto [scrollbar-width:none] ${props.class ?? ""}`}
		>
			<For each={props.options}>
				{(option) => (
					<button
						type="button"
						role="tab"
						aria-selected={props.value === option.value ? "true" : "false"}
						onClick={() => props.onChange(option.value)}
						class="focus-ring relative flex h-9 shrink-0 items-center gap-1.5 text-body text-fg-subtle transition-colors duration-fast hover:text-fg aria-selected:text-fg after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-transparent aria-selected:after:bg-fg pointer-coarse:h-11"
					>
						{option.icon}
						{option.label}
						<Show when={option.count !== undefined}>
							<span class="text-caption text-fg-faint tabular-nums">{option.count}</span>
						</Show>
					</button>
				)}
			</For>
		</div>
	);
}

/** A pill switch between a few views of the same place (Home · Activity), or a small setting. */
export function Segmented<T extends string>(props: {
	label: string;
	options: readonly TabOption<T>[];
	value: T;
	onChange: (value: T) => void;
	/** Stretch to the container, each segment an equal share. */
	block?: boolean;
	/** Icons only (labels stay for screen readers and tooltips): tight bars on phones. */
	iconsOnly?: boolean;
}): JSX.Element {
	return (
		<fieldset
			class={`${props.block ? "flex w-full" : "inline-flex self-start"} min-w-0 gap-0.5 rounded-kit border-0 bg-fill-strong p-0.5`}
		>
			<legend class="sr-only">{props.label}</legend>
			<For each={props.options}>
				{(option) => (
					<button
						type="button"
						aria-pressed={props.value === option.value ? "true" : "false"}
						title={props.iconsOnly ? option.label : undefined}
						aria-controls={option.controls}
						onClick={() => props.onChange(option.value)}
						class={`focus-ring flex h-[calc(var(--kit-h-control-sm)-0.25rem)] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-kit-sm px-2.5 text-body text-fg-subtle transition-[background-color,color,box-shadow] duration-fast ease-out-grid hover:text-fg aria-pressed:bg-surface aria-pressed:font-medium aria-pressed:text-fg aria-pressed:shadow-knob ${props.block ? "flex-1" : ""}`}
					>
						{option.icon}
						<span class={props.iconsOnly ? "sr-only" : ""}>{option.label}</span>
						<Show
							when={
								option.count !== undefined && (option.count > 0 || option.countTone === "quiet")
							}
						>
							<Show
								when={option.countTone === "quiet"}
								fallback={
									<span
										data-count
										class="inline-grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 font-medium text-micro text-white tabular-nums"
									>
										{option.count}
									</span>
								}
							>
								<span data-count class="text-caption text-fg-faint tabular-nums">
									{String(option.count)}
								</span>
							</Show>
						</Show>
					</button>
				)}
			</For>
		</fieldset>
	);
}
