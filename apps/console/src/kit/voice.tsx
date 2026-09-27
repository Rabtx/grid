import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

/**
 * Where dictation floats: the bottom-right corner, `bottom` pixels up so it rides above a phone's
 * on-screen keyboard. Only what is inside takes pointer events.
 */
export function VoiceDock(props: { bottom: number; children: JSX.Element }): JSX.Element {
	return (
		<div
			class="pointer-events-none fixed right-3 z-40 flex flex-col items-end gap-2"
			style={{ bottom: `calc(${props.bottom}px + env(safe-area-inset-bottom))` }}
		>
			{props.children}
		</div>
	);
}

/** What dictation is doing (listening, transcribing) and the words heard so far. */
export function VoiceStatus(props: { label: string; heard?: string | null }): JSX.Element {
	return (
		<output
			aria-live="polite"
			class="block w-max max-w-80 rounded-kit-lg bg-surface-raised px-3 py-2 text-body text-fg shadow-float"
		>
			<span class="block text-caption text-fg-subtle">{props.label}</span>
			<Show when={props.heard}>
				<span class="mt-0.5 block">{props.heard}</span>
			</Show>
		</output>
	);
}

/** Why dictation stopped, with a way to put it away. */
export function VoiceError(props: { message: string; onDismiss: () => void }): JSX.Element {
	return (
		<div
			role="alert"
			class="pointer-events-auto flex w-max max-w-80 items-center gap-2 rounded-kit-lg bg-danger px-3 py-2 text-body text-white shadow-float"
		>
			<span class="min-w-0 flex-1">{props.message}</span>
			<button
				type="button"
				onClick={() => props.onDismiss()}
				class="focus-ring h-7 shrink-0 rounded-kit-sm px-2 font-medium text-caption hover:bg-white/15"
			>
				OK
			</button>
		</div>
	);
}

/** The round mic that floats over a screen with no mic of its own; red while it listens. */
export const FLOATING_MIC =
	"focus-ring pointer-events-auto grid size-12 place-items-center rounded-full bg-inverse text-inverse-fg shadow-float transition-[transform,background-color] duration-fast ease-out-grid active:scale-95 disabled:opacity-60 aria-pressed:bg-danger aria-pressed:text-white";
