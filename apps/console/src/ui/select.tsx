import type { JSX } from "@solidjs/web";
import { For } from "solid-js";

import { ChevronDownIcon } from "./icons";

type SelectOption = { value: string; label: string };

/**
 * A styled native `<select>`. Native is best on phones — it gives the platform picker for free.
 * The chevron is drawn over the control with `pointer-events-none` so clicks pass through.
 */
export function Select(props: {
	options: readonly SelectOption[];
	value: string;
	onChange: (value: string) => void;
	"aria-label"?: string;
	disabled?: boolean;
	name?: string;
	class?: string;
}): JSX.Element {
	return (
		<span class={`relative block ${props.class ?? ""}`}>
			<select
				aria-label={props["aria-label"]}
				disabled={props.disabled}
				name={props.name}
				value={props.value}
				onChange={(event) => props.onChange(event.currentTarget.value)}
				class="h-field w-full min-w-0 appearance-none rounded-md border border-ink/12 bg-canvas/40 pr-8 pl-2.5 text-ink text-ui-input outline-none transition-colors duration-fast ease-out-grid hover:border-ink/20 focus:border-ink/30 disabled:opacity-50"
			>
				<For each={props.options}>
					{(option) => <option value={option.value}>{option.label}</option>}
				</For>
			</select>
			<ChevronDownIcon class="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-ink/50" />
		</span>
	);
}
