import { afterEach } from "vitest";

/**
 * The popover API for component tests: happy-dom has none, and every kit menu, select and
 * picker opens through it. A click on a `popovertarget` button toggles its panel, `:popover-open`
 * matches while it is shown, and each change fires `toggle` — enough for tests to open a menu
 * the way a person does.
 */
const OPEN = "data-test-popover-open";

type PopoverElement = HTMLElement & {
	showPopover(): void;
	hidePopover(): void;
	togglePopover(force?: boolean): boolean;
};

if (typeof HTMLElement !== "undefined" && !("showPopover" in HTMLElement.prototype)) {
	const proto = HTMLElement.prototype as PopoverElement;

	function set(el: HTMLElement, open: boolean): void {
		if (el.hasAttribute(OPEN) === open) return;
		if (open) {
			// An auto popover closes the others, as the platform does.
			for (const other of document.querySelectorAll<HTMLElement>(`[${OPEN}]`)) set(other, false);
			el.setAttribute(OPEN, "");
		} else el.removeAttribute(OPEN);
		el.dispatchEvent(new Event("toggle"));
	}

	proto.showPopover = function showPopover(this: HTMLElement) {
		set(this, true);
	};
	proto.hidePopover = function hidePopover(this: HTMLElement) {
		set(this, false);
	};
	proto.togglePopover = function togglePopover(this: HTMLElement, force?: boolean) {
		const open = force ?? !this.hasAttribute(OPEN);
		set(this, open);
		return open;
	};

	const matches = Element.prototype.matches;
	Object.defineProperty(Element.prototype, "matches", {
		configurable: true,
		value(this: Element, selector: string): boolean {
			if (selector === ":popover-open") return this.hasAttribute(OPEN);
			return matches.call(this, selector);
		},
	});

	document.addEventListener("click", (event) => {
		const button = (event.target as Element | null)?.closest?.("[popovertarget]");
		const id = button?.getAttribute("popovertarget");
		const panel = id ? (document.getElementById(id) as PopoverElement | null) : null;
		panel?.togglePopover();
	});
}

// A reactive value read where it will not update is a bug (Solid's STRICT_READ_UNTRACKED): a
// component test that causes one fails, rather than the console filling with warnings again.
const untrackedReads: string[] = [];
const warn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
	if (!String(args[0]).includes("STRICT_READ_UNTRACKED")) return warn(...args);
	// Where: the first frames in the console's own code.
	const where = (new Error().stack ?? "")
		.split("\n")
		.filter((line) => line.includes("/src/") && !line.includes("test-setup"))
		.slice(0, 3)
		.map((line) =>
			line
				.trim()
				.replace(/^at /, "")
				.replace(/^.*\/src\//, "src/"),
		)
		.join(" <- ");
	untrackedReads.push(`${String(args[0]).split(" will not")[0]} at ${where}`);
};
afterEach(() => {
	const found = untrackedReads.splice(0);
	if (found.length) throw new Error(`${found.length} untracked reactive read(s): ${found[0]}`);
});
