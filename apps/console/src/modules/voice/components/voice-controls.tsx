import type { JSX } from "@solidjs/web";
import { createSignal, onSettled, Show } from "solid-js";

import { useAuth } from "@/modules/auth";
import { Button, MicIcon } from "@/ui";

import { dictation, configureTranscription } from "../lib/dictation";
import { type DictationTarget, lastTarget, trackFocus } from "../lib/dictation-target";
import { transcribeWithRunner } from "../services/transcribe.service";

/**
 * The app-wide voice input, mounted once. A mic floats above the keyboard whenever the cursor is
 * in a text field; tap it, speak, tap again, and the words land at the cursor. While listening,
 * a bubble shows what has been heard so far. Ctrl+Shift+Space (⌘⇧Space on macOS) toggles it from
 * a physical keyboard. Surfaces with their own mic key (the terminal) use `dictation` directly.
 */
export function VoiceControls(): JSX.Element {
	const auth = useAuth();
	const [focused, setFocused] = createSignal<DictationTarget | null>(null);
	// Clear of the status bar that closes every signed-in screen.
	const CLEARANCE = 48;
	const [bottom, setBottom] = createSignal(CLEARANCE);

	configureTranscription(async (audio) => {
		const token = auth.token() ?? (await auth.renew());
		if (!token) throw new Error("Sign in again to use voice input.");
		return transcribeWithRunner(token, audio);
	});

	const active = () => dictation.status() !== "idle";
	const showMic = () => active() || focused()?.floatingMic === true;

	onSettled(() => {
		const stopTracking = trackFocus(setFocused);

		// Sit just above the on-screen keyboard: it shrinks the visual viewport, not the layout one.
		const place = () => {
			const viewport = window.visualViewport;
			const hidden = viewport ? window.innerHeight - (viewport.offsetTop + viewport.height) : 0;
			setBottom(Math.max(0, hidden) + CLEARANCE);
		};
		place();
		window.visualViewport?.addEventListener("resize", place);
		window.visualViewport?.addEventListener("scroll", place);

		const onKey = (event: KeyboardEvent) => {
			const mod = event.ctrlKey || event.metaKey;
			if (mod && event.shiftKey && event.code === "Space") {
				event.preventDefault();
				event.stopPropagation();
				dictation.toggle(lastTarget());
			} else if (event.key === "Escape" && active()) {
				dictation.cancel();
			}
		};
		// Capture, so it works while the terminal (which eats keys) has focus.
		document.addEventListener("keydown", onKey, { capture: true });

		return () => {
			stopTracking();
			window.visualViewport?.removeEventListener("resize", place);
			window.visualViewport?.removeEventListener("scroll", place);
			document.removeEventListener("keydown", onKey, { capture: true });
		};
	});

	return (
		<div
			class="pointer-events-none fixed right-3 z-40 flex flex-col items-end gap-2"
			style={{ bottom: `calc(${bottom()}px + env(safe-area-inset-bottom))` }}
		>
			<Show when={active()}>
				<output
					aria-live="polite"
					class="glass block max-w-[min(20rem,calc(100vw-5rem))] rounded-lg border border-stroke px-3 py-2 text-ink text-ui-sm shadow-lg"
				>
					<span class="block text-ink/45 text-ui-xs">
						{dictation.status() === "transcribing"
							? "Transcribing…"
							: `Listening · into ${dictation.targetLabel() ?? "the cursor"}`}
					</span>
					<Show when={dictation.interim()}>
						<span class="mt-0.5 block">{dictation.interim()}</span>
					</Show>
				</output>
			</Show>
			<Show when={dictation.error()}>
				<div
					role="alert"
					class="pointer-events-auto flex max-w-[min(20rem,calc(100vw-1.5rem))] items-center gap-2 rounded-lg bg-danger px-3 py-2 text-canvas text-ui-sm shadow-lg"
				>
					<span class="min-w-0 flex-1">{dictation.error()}</span>
					<Button
						size="sm"
						variant="ghost"
						class="text-canvas"
						onClick={() => dictation.dismissError()}
					>
						OK
					</Button>
				</div>
			</Show>
			<Show when={showMic()}>
				<MicButton />
			</Show>
		</div>
	);
}

/**
 * The mic itself: never takes focus, so the cursor (and the phone keyboard) stay where they were.
 * Also used by surfaces that host their own mic, like the terminal key bar.
 */
export function MicButton(props: {
	class?: string;
	target?: () => DictationTarget | null;
}): JSX.Element {
	const listening = () => dictation.status() === "listening";
	const busy = () => dictation.status() === "transcribing";
	return (
		<button
			type="button"
			aria-label={listening() ? "Stop voice input" : "Voice input"}
			aria-pressed={listening() ? "true" : "false"}
			disabled={busy()}
			onPointerDown={(event) => event.preventDefault()}
			onClick={() => dictation.toggle(props.target ? props.target() : lastTarget())}
			class={
				props.class ??
				"focus-ring pointer-events-auto grid size-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition-[transform,background-color] duration-fast ease-out-grid active:scale-95 disabled:opacity-60 aria-pressed:bg-danger aria-pressed:text-canvas"
			}
		>
			<MicIcon class={`size-5 ${listening() ? "motion-safe:animate-pulse" : ""}`} />
		</button>
	);
}
