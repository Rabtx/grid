import type { JSX } from "@solidjs/web";
import { createMemo, createSignal, For, Show } from "solid-js";

import { type DictationTarget, MicButton } from "@/modules/voice";

import { type Arrow, BACK_TAB, KEY_SEQUENCES, type Modifiers } from "../lib/keys";

export function hapticTick(durationMs = 12): void {
	if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
		try {
			navigator.vibrate(durationMs);
		} catch {
			// Vibration not allowed or supported
		}
	}
}

type Key =
	| { kind: "send"; label: string; name: string; data: string }
	| { kind: "modifier"; label: string; name: string; modifier: keyof Modifiers }
	| { kind: "arrow"; label: string; name: string; arrow: Arrow };

// Primary row: what a phone keyboard lacks, in the order people reach for it.
const MAIN_KEYS: Key[] = [
	{ kind: "send", label: "esc", name: "Escape", data: "\x1b" },
	{ kind: "send", label: "tab", name: "Tab", data: "\t" },
	// One tap for Shift+Tab: agent CLIs use it to cycle modes.
	{ kind: "send", label: "⇤", name: "Shift Tab", data: BACK_TAB },
	{ kind: "modifier", label: "shift", name: "Shift", modifier: "shift" },
	{ kind: "modifier", label: "ctrl", name: "Control", modifier: "ctrl" },
	{ kind: "modifier", label: "alt", name: "Alt", modifier: "alt" },
	{ kind: "arrow", label: "←", name: "Left", arrow: "left" },
	{ kind: "arrow", label: "↓", name: "Down", arrow: "down" },
	{ kind: "arrow", label: "↑", name: "Up", arrow: "up" },
	{ kind: "arrow", label: "→", name: "Right", arrow: "right" },
	{ kind: "send", label: "|", name: "Pipe", data: "|" },
	{ kind: "send", label: "/", name: "Slash", data: "/" },
	{ kind: "send", label: "-", name: "Dash", data: "-" },
	{ kind: "send", label: "~", name: "Tilde", data: "~" },
];

// Secondary row: function and full navigation keys.
const EXTRA_KEYS: Key[] = [
	{ kind: "send", label: "F1", name: "F1", data: KEY_SEQUENCES.f1 },
	{ kind: "send", label: "F2", name: "F2", data: KEY_SEQUENCES.f2 },
	{ kind: "send", label: "F3", name: "F3", data: KEY_SEQUENCES.f3 },
	{ kind: "send", label: "F4", name: "F4", data: KEY_SEQUENCES.f4 },
	{ kind: "send", label: "F5", name: "F5", data: KEY_SEQUENCES.f5 },
	{ kind: "send", label: "F6", name: "F6", data: KEY_SEQUENCES.f6 },
	{ kind: "send", label: "F7", name: "F7", data: KEY_SEQUENCES.f7 },
	{ kind: "send", label: "F8", name: "F8", data: KEY_SEQUENCES.f8 },
	{ kind: "send", label: "F9", name: "F9", data: KEY_SEQUENCES.f9 },
	{ kind: "send", label: "F10", name: "F10", data: KEY_SEQUENCES.f10 },
	{ kind: "send", label: "F11", name: "F11", data: KEY_SEQUENCES.f11 },
	{ kind: "send", label: "F12", name: "F12", data: KEY_SEQUENCES.f12 },
	{ kind: "send", label: "home", name: "Home", data: KEY_SEQUENCES.home },
	{ kind: "send", label: "end", name: "End", data: KEY_SEQUENCES.end },
	{ kind: "send", label: "pgup", name: "Page Up", data: KEY_SEQUENCES.pageUp },
	{ kind: "send", label: "pgdn", name: "Page Down", data: KEY_SEQUENCES.pageDown },
	{ kind: "send", label: "ins", name: "Insert", data: KEY_SEQUENCES.insert },
	{ kind: "send", label: "del", name: "Delete", data: KEY_SEQUENCES.delete },
];

const KEY =
	"grid min-h-11 min-w-11 shrink-0 select-none place-items-center rounded-md px-2.5 font-mono text-ink/80 text-ui-sm transition-colors duration-fast ease-out-grid active:bg-ink/15 aria-pressed:bg-ink aria-pressed:text-canvas";

/**
 * The keys a phone keyboard does not have, above it. Ctrl and Alt arm for the next key, typed
 * here or on the keyboard. Buttons never take focus, so the keyboard stays open while tapping.
 * Swipeable between main keys and extra keys (F1-F12, Home, End, PgUp, PgDn).
 * Touch only: with a physical keyboard the bar would just take room.
 */
export function KeyBar(props: {
	modifiers: Modifiers;
	onToggle: (modifier: keyof Modifiers) => void;
	onSend: (data: string) => void;
	onArrow: (arrow: Arrow) => void;
	onPaste: () => void;
	/** Where the key bar's mic types: the terminal that is showing. */
	dictationTarget: () => DictationTarget | null;
}): JSX.Element {
	const [page, setPage] = createSignal<0 | 1>(0);

	let touchStartX = 0;
	let touchStartY = 0;

	function press(key: Key): void {
		hapticTick();
		if (key.kind === "modifier") props.onToggle(key.modifier);
		else if (key.kind === "arrow") props.onArrow(key.arrow);
		else props.onSend(key.data);
	}

	const currentKeys = createMemo(() => (page() === 0 ? MAIN_KEYS : EXTRA_KEYS));

	const onTouchStart = (event: TouchEvent) => {
		if (event.touches.length !== 1) return;
		touchStartX = event.touches[0].clientX;
		touchStartY = event.touches[0].clientY;
	};

	const onTouchEnd = (event: TouchEvent) => {
		if (event.changedTouches.length !== 1) return;
		const dx = event.changedTouches[0].clientX - touchStartX;
		const dy = event.changedTouches[0].clientY - touchStartY;
		// Detect horizontal swipe across pages
		if (Math.abs(dx) > 35 && Math.abs(dx) > Math.abs(dy) * 1.5) {
			if (dx < 0 && page() === 0) {
				setPage(1);
				hapticTick(16);
			} else if (dx > 0 && page() === 1) {
				setPage(0);
				hapticTick(16);
			}
		}
	};

	return (
		<div
			role="toolbar"
			aria-label="Terminal keys"
			onTouchStart={onTouchStart}
			onTouchEnd={onTouchEnd}
			class="hidden shrink-0 items-center gap-1 overflow-x-auto border-stroke border-t px-1 py-1 [scrollbar-width:none] pointer-coarse:flex"
		>
			<For each={currentKeys()}>
				{(key) => (
					<button
						type="button"
						aria-label={key.name}
						aria-pressed={
							key.kind === "modifier"
								? props.modifiers[key.modifier]
									? "true"
									: "false"
								: undefined
						}
						// Keep focus (and the soft keyboard) on the terminal.
						onPointerDown={(event) => event.preventDefault()}
						onClick={() => press(key)}
						class={KEY}
					>
						{key.label}
					</button>
				)}
			</For>

			<Show when={page() === 0}>
				<MicButton
					target={props.dictationTarget}
					class={`${KEY} aria-pressed:bg-danger aria-pressed:text-canvas`}
				/>
				<button
					type="button"
					aria-label="Paste"
					onPointerDown={(event) => event.preventDefault()}
					onClick={() => {
						hapticTick();
						props.onPaste();
					}}
					class={KEY}
				>
					paste
				</button>
			</Show>

			{/* Page toggle button / indicator */}
			<button
				type="button"
				aria-label={page() === 0 ? "Show function and extra keys" : "Show main keys"}
				onPointerDown={(event) => event.preventDefault()}
				onClick={() => {
					hapticTick();
					setPage((p) => (p === 0 ? 1 : 0));
				}}
				class={`${KEY} bg-ink/5 font-sans font-medium text-ui-xs`}
			>
				<span class="flex items-center gap-1">
					<span>{page() === 0 ? "Fn" : "123"}</span>
					<span class="flex gap-0.5" aria-hidden="true">
						<span class={`size-1 rounded-full ${page() === 0 ? "bg-ink" : "bg-ink/30"}`} />
						<span class={`size-1 rounded-full ${page() === 1 ? "bg-ink" : "bg-ink/30"}`} />
					</span>
				</span>
			</button>
		</div>
	);
}
