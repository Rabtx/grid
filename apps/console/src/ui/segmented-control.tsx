import type { JSX } from "@solidjs/web";
import { For } from "solid-js";

/**
 * Pick one of a few views. The active segment carries more ink; inactive ones stay secondary.
 * Uses `aria-pressed` buttons in a fieldset — it switches a view in place, not a tab panel.
 */
export function SegmentedControl<T extends string>(props: {
	label: string;
	options: readonly { value: T; label: string }[];
	value: T;
	onChange: (value: T) => void;
}): JSX.Element {
	return (
		<fieldset class="inline-flex min-w-0 rounded-md border-0 bg-ink/5 p-0.5">
			<legend class="sr-only">{props.label}</legend>
			<For each={props.options}>
				{(option) => (
					<button
						type="button"
						aria-pressed={props.value === option.value ? "true" : "false"}
						onClick={() => props.onChange(option.value)}
						class="focus-ring inline-flex h-[calc(var(--spacing-control)-0.25rem)] items-center rounded-sm px-2.5 text-ink/55 text-ui-sm transition-colors duration-fast ease-out-grid hover:text-ink aria-pressed:bg-ink/10 aria-pressed:text-ink pointer-coarse:min-h-10"
					>
						{option.label}
					</button>
				)}
			</For>
		</fieldset>
	);
}
