/**
 * Where dictated text goes: wherever the cursor is. Plain text fields and editable regions work on
 * their own; a surface that draws its own input (the terminal) registers a handler, and later
 * surfaces (a chat composer) do the same — nothing else in the app needs to know about voice.
 */

export type DictationTarget = {
	/** Put the words in at the cursor. */
	insert: (text: string) => void;
	/** Give the target focus back, e.g. after a tap on the mic took it. */
	focus: () => void;
	/** For display: "Terminal", "Task title"… */
	label: string;
	/** False when the surface has its own mic control (the terminal key bar). */
	floatingMic: boolean;
	/**
	 * Who the target belongs to, when it draws dictation itself (the composer's recording bar):
	 * the app-wide status bubble then stays away.
	 */
	owner?: object;
};

type Registration = {
	insert: (text: string) => void;
	label: string;
	focus?: () => void;
	floatingMic?: boolean;
	owner?: object;
};

const registered = new Map<Element, Registration>();
let last: DictationTarget | null = null;
let lastElement: Element | null = null;

/**
 * Make an element (and everything inside it) a dictation target with its own insert. Returns
 * the unregister function. Registered targets win over the plain-field handling below, so the
 * terminal's hidden input never receives text directly.
 */
export function registerDictationTarget(element: Element, target: Registration): () => void {
	registered.set(element, target);
	return () => {
		registered.delete(element);
		if (lastElement && element.contains(lastElement)) {
			last = null;
			lastElement = null;
		}
	};
}

type TextField = HTMLInputElement | HTMLTextAreaElement;

const TEXT_INPUT_TYPES = new Set(["text", "search", "url", "tel", "email", "password", ""]);

function isTextField(element: Element): element is TextField {
	if (element instanceof HTMLTextAreaElement) return !element.readOnly && !element.disabled;
	return (
		element instanceof HTMLInputElement &&
		TEXT_INPUT_TYPES.has(element.type) &&
		!element.readOnly &&
		!element.disabled
	);
}

/**
 * Insert into a text field at its caret (replacing a selection), with a space where the words
 * would otherwise run into the text before them, and tell the app the value changed.
 */
export function insertIntoField(field: TextField, text: string): void {
	const start = field.selectionStart ?? field.value.length;
	const end = field.selectionEnd ?? start;
	const before = field.value.slice(0, start);
	const spaced = before && !/\s$/.test(before) && !/^\s/.test(text) ? ` ${text}` : text;
	field.setRangeText(spaced, start, end, "end");
	// The app listens for `input`, as it would for typing.
	field.dispatchEvent(new Event("input", { bubbles: true }));
}

function describeField(field: TextField): string {
	return field.getAttribute("aria-label") || field.placeholder || "Text field";
}

/** The dictation target for an element, if it is (or is inside) one. */
export function targetFor(element: Element | null): DictationTarget | null {
	if (!element) return null;
	for (let node: Element | null = element; node; node = node.parentElement) {
		const custom = registered.get(node);
		if (custom) {
			return {
				insert: custom.insert,
				label: custom.label,
				focus: custom.focus ?? (() => (element as HTMLElement).focus?.()),
				floatingMic: custom.floatingMic ?? true,
				owner: custom.owner,
			};
		}
	}
	if (isTextField(element)) {
		return {
			insert: (text) => insertIntoField(element, text),
			label: describeField(element),
			focus: () => element.focus(),
			floatingMic: true,
		};
	}
	if (element instanceof HTMLElement && element.isContentEditable) {
		return {
			insert: (text) => {
				element.focus();
				document.execCommand("insertText", false, text);
			},
			label: element.getAttribute("aria-label") ?? "Text",
			focus: () => element.focus(),
			floatingMic: true,
		};
	}
	return null;
}

/**
 * Follow focus so the mic knows where the cursor was even after focus moves. Returns the stop
 * function, and calls `onChange` with whether the focused element is a target right now.
 */
export function trackFocus(onChange: (focused: DictationTarget | null) => void): () => void {
	const onFocusIn = (event: FocusEvent) => {
		const element = event.target as Element;
		const target = targetFor(element);
		if (target) {
			last = target;
			lastElement = element;
		}
		onChange(target);
	};
	const onFocusOut = (event: FocusEvent) => {
		// Focus moving to another target is handled by its focusin; leaving targets entirely is not.
		if (!targetFor(event.relatedTarget as Element | null)) onChange(null);
	};
	document.addEventListener("focusin", onFocusIn);
	document.addEventListener("focusout", onFocusOut);
	return () => {
		document.removeEventListener("focusin", onFocusIn);
		document.removeEventListener("focusout", onFocusOut);
	};
}

/** The target the cursor was last in. */
export function lastTarget(): DictationTarget | null {
	if (lastElement && !lastElement.isConnected) {
		last = null;
		lastElement = null;
	}
	return last;
}
