export type Shortcut = {
	keys: string;
	label: string;
	run: () => void;
};

const SEQUENCE_TIMEOUT_MS = 1_000;
const editableSelector = "input, textarea, select, [contenteditable=true]";

function isEditable(target: EventTarget | null): boolean {
	return target instanceof Element && Boolean(target.closest(editableSelector));
}

function isTerminal(target: EventTarget | null): boolean {
	return target instanceof Element && Boolean(target.closest(".xterm"));
}

function normalizeKey(event: KeyboardEvent): string {
	return event.key.length === 1 ? event.key.toLowerCase() : event.key;
}

export function installShortcuts(shortcuts: readonly Shortcut[], target: Document): () => void {
	let sequence: string | undefined;
	let sequenceAt = 0;

	const onKeydown = (event: KeyboardEvent) => {
		if (isEditable(event.target) || isTerminal(event.target)) return;
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		if (matchMedia("(pointer: coarse)").matches) return;

		const key = normalizeKey(event);
		const now = Date.now();
		if (sequence && now - sequenceAt <= SEQUENCE_TIMEOUT_MS) {
			const combined = `${sequence} ${key}`;
			const sequenceShortcut = shortcuts.find((shortcut) => shortcut.keys === combined);
			sequence = undefined;
			if (sequenceShortcut) {
				event.preventDefault();
				sequenceShortcut.run();
				return;
			}
		}

		const shortcut = shortcuts.find((item) => item.keys === key);
		if (shortcut) {
			event.preventDefault();
			shortcut.run();
			return;
		}
		sequence = key;
		sequenceAt = now;
	};

	target.addEventListener("keydown", onKeydown);
	return () => target.removeEventListener("keydown", onKeydown);
}
