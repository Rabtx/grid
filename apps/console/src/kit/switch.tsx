import type { JSX } from "@solidjs/web";

/** An on/off toggle, the accent when on. */
export function Switch(props: {
	label: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
	disabled?: boolean;
}): JSX.Element {
	return (
		<button
			type="button"
			role="switch"
			aria-label={props.label}
			aria-checked={props.checked ? "true" : "false"}
			disabled={props.disabled}
			onClick={() => props.onChange(!props.checked)}
			class="focus-ring relative inline-flex h-5 w-8.5 shrink-0 items-center rounded-full bg-fill-strong transition-colors duration-fast ease-out-grid aria-checked:bg-accent disabled:opacity-40 pointer-coarse:h-6 pointer-coarse:w-10"
		>
			<span
				class={`size-4 rounded-full bg-white shadow-knob transition-transform duration-fast ease-out-grid pointer-coarse:size-5 ${props.checked ? "translate-x-4 pointer-coarse:translate-x-4.5" : "translate-x-0.5"}`}
			/>
		</button>
	);
}

/** A checkbox drawn to match the kit: the native input underneath, a tick drawn over it. */
export function Checkbox(props: {
	label: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
	indeterminate?: boolean;
}): JSX.Element {
	return (
		<span class="relative inline-grid size-4 shrink-0 place-items-center">
			<input
				type="checkbox"
				aria-label={props.label}
				checked={props.checked}
				ref={(el) => {
					el.indeterminate = props.indeterminate ?? false;
				}}
				onChange={(event) => props.onChange(event.currentTarget.checked)}
				class="peer focus-ring size-4 cursor-pointer appearance-none rounded-[5px] bg-surface ring-line-strong transition-colors duration-fast checked:bg-inverse checked:shadow-none indeterminate:bg-inverse indeterminate:shadow-none"
			/>
			<svg
				viewBox="0 0 16 16"
				fill="none"
				aria-hidden="true"
				class="pointer-events-none absolute size-3 text-inverse-fg opacity-0 peer-checked:opacity-100"
			>
				<path
					d="M4 8.5l2.5 2.5L12 5.5"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
			<span
				aria-hidden="true"
				class="pointer-events-none absolute h-0.5 w-2 rounded-full bg-inverse-fg opacity-0 peer-indeterminate:opacity-100"
			/>
		</span>
	);
}

/** A checkbox with its label beside it, the whole row a target (e.g. "Add another"). */
export function CheckboxField(props: {
	label: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
	/** Layout only. */
	class?: string;
}): JSX.Element {
	return (
		<label
			class={`flex min-h-10 cursor-pointer items-center gap-2 text-body text-fg-subtle ${props.class ?? ""}`}
		>
			<Checkbox label={props.label} checked={props.checked} onChange={props.onChange} />
			<span aria-hidden="true">{props.label}</span>
		</label>
	);
}
