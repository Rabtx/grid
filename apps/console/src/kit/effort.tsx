import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import { EffortSky } from "./effort-sky/effort-sky";

export type EffortLevel = { id: string; name: string };

/** The level most work wants, when the model offers it. */
const RECOMMENDED = "medium";
/** A level some agents list that only means "the model decides": no choice made, not a step. */
const UNCHOSEN = "default";

/**
 * How hard the model thinks (the model picker, a thread's settings and a teammate's): the brain
 * slider, with medium marked as recommended when the model has it, and shown while nothing is
 * chosen yet (the model's own default). An agent's "default" level is that same unchosen state, so
 * it is not a step of its own (it would sit past the highest one).
 */
export function EffortSlider(props: {
	label: string;
	levels: readonly EffortLevel[];
	value: string | null;
	onChange: (id: string) => void;
}): JSX.Element {
	const levels = () => props.levels.filter((level) => level.id !== UNCHOSEN);
	const recommended = () =>
		levels().some((level) => level.id === RECOMMENDED) ? RECOMMENDED : null;
	const value = () => (props.value === UNCHOSEN ? null : props.value);
	return (
		<Show when={levels().length > 0}>
			<EffortSky
				label={props.label}
				levels={levels()}
				value={value() ?? recommended()}
				recommendedId={recommended()}
				onChange={props.onChange}
			/>
		</Show>
	);
}
