import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";

import { Kbd } from "./badge";

/**
 * A command's keys in Settings → Keybindings: each binding as keys (a sequence's steps with "then"
 * between), and the button that records new ones. While recording it says so and waits for the
 * next key press; Escape gives up.
 */
export function KeyRecorder(props: {
	label: string;
	/** Each binding: its steps, each step its keys ("⌘", "K"). */
	bindings: readonly (readonly (readonly string[])[])[];
	recording: boolean;
	/** The keys pressed so far, while a sequence is being recorded. */
	pending?: readonly string[];
	onRecord: () => void;
}): JSX.Element {
	const steps = (binding: readonly (readonly string[])[]) => (
		<span class="inline-flex items-center gap-1">
			<For each={binding}>
				{(step, index) => (
					<>
						<Show when={index() > 0}>
							<span class="text-caption text-fg-faint">then</span>
						</Show>
						<For each={step}>{(key) => <Kbd>{key}</Kbd>}</For>
					</>
				)}
			</For>
		</span>
	);
	return (
		<button
			type="button"
			aria-label={
				props.recording ? `Recording keys for ${props.label}` : `Change keys for ${props.label}`
			}
			aria-pressed={props.recording ? "true" : "false"}
			onClick={() => props.onRecord()}
			class={`focus-ring inline-flex min-h-kit-control-sm min-w-28 items-center justify-end gap-2 rounded-tile px-2 transition-colors duration-fast ${props.recording ? "bg-accent/10 ring-1 ring-accent" : "hover:bg-fill"}`}
		>
			<Show
				when={props.recording}
				fallback={
					<Show
						when={props.bindings.length}
						fallback={<span class="text-caption text-fg-faint">Not set</span>}
					>
						<For each={props.bindings}>{(binding) => steps(binding)}</For>
					</Show>
				}
			>
				<Show
					when={props.pending?.length}
					fallback={<span class="text-caption text-accent">Press keys…</span>}
				>
					<span class="inline-flex items-center gap-1">
						<For each={props.pending}>{(key) => <Kbd>{key}</Kbd>}</For>
						<span class="text-caption text-accent">then…</span>
					</span>
				</Show>
			</Show>
		</button>
	);
}
