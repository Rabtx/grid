import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, onCleanup, Show, untrack } from "solid-js";

import { EffortSky } from "./effort-sky/effort-sky";

export type EffortLevel = { id: string; name: string };

/** The level most work wants, when the model offers it. */
const RECOMMENDED = "medium";
/** How long the slider rests before its level is sent: a drag across five steps sends one change. */
const SETTLE_MS = 220;
/** How long a sent level is shown before the parent's own value is trusted again. */
const CONFIRM_MS = 4000;
/** A level some agents list that only means "the model decides": no choice made, not a step. */
const UNCHOSEN = "default";

/**
 * How hard the model thinks (the model picker, a thread's settings and a teammate's): the brain
 * slider, with medium marked as recommended when the model has it, and shown while nothing is
 * chosen yet (the model's own default). An agent's "default" level is that same unchosen state, so
 * it is not a step of its own (it would sit past the highest one).
 *
 * The slider answers at once: a step shows as soon as it is picked, and is sent once the slider
 * rests, so a drag is one change for the agent and never waits on its reply. Until the parent's
 * value catches up, the picked step is the one shown; if it never does, the parent's wins.
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
	const [picked, setPicked] = createSignal<string | null>(null);
	let send: ReturnType<typeof setTimeout> | undefined;
	let giveUp: ReturnType<typeof setTimeout> | undefined;
	onCleanup(() => {
		clearTimeout(send);
		clearTimeout(giveUp);
	});
	// The parent caught up: its value is the truth again.
	createEffect(
		() => props.value,
		(next) => {
			if (next !== null && next === untrack(picked)) {
				clearTimeout(giveUp);
				setPicked(null);
			}
		},
	);
	function choose(id: string): void {
		setPicked(id);
		clearTimeout(send);
		clearTimeout(giveUp);
		send = setTimeout(() => {
			if (id !== untrack(() => props.value)) props.onChange(id);
			giveUp = setTimeout(() => setPicked(null), CONFIRM_MS);
		}, SETTLE_MS);
	}
	const value = () => picked() ?? (props.value === UNCHOSEN ? null : props.value);
	return (
		<Show when={levels().length > 0}>
			<EffortSky
				label={props.label}
				levels={levels()}
				value={value() ?? recommended()}
				recommendedId={recommended()}
				onChange={choose}
			/>
		</Show>
	);
}
