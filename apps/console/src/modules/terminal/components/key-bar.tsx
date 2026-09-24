import type { JSX } from "@solidjs/web";
import { For } from "solid-js";

import type { Arrow, Modifiers } from "../lib/keys";

type Key =
	| { kind: "send"; label: string; name: string; data: string }
	| { kind: "modifier"; label: string; name: string; modifier: keyof Modifiers }
	| { kind: "arrow"; label: string; name: string; arrow: Arrow };

// What a phone keyboard lacks, in the order people reach for it.
const KEYS: Key[] = [
	{ kind: "send", label: "esc", name: "Escape", data: "\x1b" },
	{ kind: "send", label: "tab", name: "Tab", data: "\t" },
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

const KEY =
	"grid h-10 min-w-11 shrink-0 select-none place-items-center rounded-md px-2.5 font-mono text-ink/80 text-ui-sm transition-colors duration-fast ease-out-grid active:bg-ink/15 aria-pressed:bg-ink aria-pressed:text-canvas";

/**
 * The keys a phone keyboard does not have, above it. Ctrl and Alt arm for the next key, typed
 * here or on the keyboard. Buttons never take focus, so the keyboard stays open while tapping.
 * Touch only: with a physical keyboard the bar would just take room.
 */
export function KeyBar(props: {
	modifiers: Modifiers;
	onToggle: (modifier: keyof Modifiers) => void;
	onSend: (data: string) => void;
	onArrow: (arrow: Arrow) => void;
	onPaste: () => void;
}): JSX.Element {
	function press(key: Key): void {
		if (key.kind === "modifier") props.onToggle(key.modifier);
		else if (key.kind === "arrow") props.onArrow(key.arrow);
		else props.onSend(key.data);
	}

	return (
		<div
			role="toolbar"
			aria-label="Terminal keys"
			class="hidden shrink-0 gap-1 overflow-x-auto border-stroke border-t px-1 py-1 [scrollbar-width:none] pointer-coarse:flex"
		>
			<For each={KEYS}>
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
			<button
				type="button"
				aria-label="Paste"
				onPointerDown={(event) => event.preventDefault()}
				onClick={() => props.onPaste()}
				class={KEY}
			>
				paste
			</button>
		</div>
	);
}
