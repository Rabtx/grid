import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";

/**
 * An agent thinking, in place of a plain "Working…": Grid's 3×3 grid of dots rippling across
 * diagonally in the accent, the phase — what it is doing now ("Thinking", "Reading src/app.ts",
 * "Writing") — in a gradient that moves through it, and how long it has been going. Announced
 * politely, once per phase rather than every second. Still under reduced motion.
 */
export function ThinkingLoader(props: {
	/** What the agent is doing now: "Thinking", "Reading src/app.ts", "Writing". */
	phase: string;
	/** How long it has been at it: "12s". */
	elapsed?: string;
	/** Layout only. */
	class?: string;
}): JSX.Element {
	return (
		<span class={`inline-flex min-w-0 items-center gap-2.5 ${props.class ?? ""}`}>
			<span aria-hidden="true" class="grid shrink-0 grid-cols-3 gap-[2px]">
				<For each={[0, 1, 2, 3, 4, 5, 6, 7, 8]}>
					{(dot) => (
						<span
							class="kit-think-dot size-[3px] rounded-full bg-accent"
							style={{ "--kit-dot": String((dot % 3) + Math.floor(dot / 3)) }}
						/>
					)}
				</For>
			</span>
			<span aria-live="polite" class="kit-think-text min-w-0 truncate">
				{props.phase}
			</span>
			<Show when={props.elapsed}>
				<span class="shrink-0 text-fg-faint tabular-nums">{props.elapsed}</span>
			</Show>
		</span>
	);
}
