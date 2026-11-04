import type { JSX } from "@solidjs/web";

import { EffortSky } from "./effort-sky/effort-sky";

export type EffortLevel = { id: string; name: string };

/** The level most work wants, when the model offers it. */
const RECOMMENDED = "medium";

/**
 * How hard the model thinks (the model picker, a thread's settings and a teammate's): the brain
 * slider, with medium marked as recommended when the model has it, and shown while nothing is
 * chosen yet (the model's own default).
 */
export function EffortSlider(props: {
	label: string;
	levels: readonly EffortLevel[];
	value: string | null;
	onChange: (id: string) => void;
}): JSX.Element {
	const recommended = () =>
		props.levels.some((level) => level.id === RECOMMENDED) ? RECOMMENDED : null;
	return (
		<EffortSky
			label={props.label}
			levels={props.levels}
			value={props.value ?? recommended()}
			recommendedId={recommended()}
			onChange={props.onChange}
		/>
	);
}
