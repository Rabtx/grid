import { render } from "@solidjs/web";
import { createSignal, flush } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";

import { AgentLogo } from "./avatar";

/** The file the mark is drawn from, or `svg`/`initial` for the two drawn inline. */
function mark(container: HTMLElement): string {
	const image = container.querySelector("img");
	if (image) return image.getAttribute("src") ?? "";
	if (container.querySelector("svg")) return "svg";
	return `initial:${container.textContent?.trim() ?? ""}`;
}

describe("AgentLogo", () => {
	let dispose: (() => void) | undefined;
	afterEach(() => {
		dispose?.();
		document.body.replaceChildren();
	});

	function mount(start: { id: string; name: string }): {
		agent: (next: { id: string; name: string }) => void;
		container: HTMLElement;
	} {
		const container = document.createElement("div");
		document.body.append(container);
		const [agent, setAgent] = createSignal(start);
		dispose = render(() => <AgentLogo id={agent().id} name={agent().name} />, container);
		// Solid 2 holds updates back to the microtask, so let them land before looking.
		return { agent: (next) => (setAgent(next), flush()), container };
	}

	it("draws the mark of the agent it was given", () => {
		const claude = mount({ id: "claude", name: "Claude Code" });
		expect(mark(claude.container)).toBe("svg");

		const codex = mount({ id: "codex", name: "Codex" });
		expect(mark(codex.container)).toBe("/agents/codex.svg");

		// The uppercase is the style's doing: the letters themselves are as given.
		const other = mount({ id: "somebody-else", name: "Somebody Else" });
		expect(mark(other.container)).toBe("initial:So");
	});

	it("changes mark when the agent changes under it", () => {
		// The mark was picked by reading the id in the component body, which Solid runs once and
		// untracked: picking another agent in the picker renamed the chip and left the logo of the
		// agent before, because nothing was watching the id.
		const { agent, container } = mount({ id: "claude", name: "Claude Code" });
		expect(mark(container)).toBe("svg");

		agent({ id: "codex", name: "Codex" });
		expect(mark(container)).toBe("/agents/codex.svg");

		agent({ id: "opencode", name: "opencode" });
		expect(mark(container)).toBe("svg");

		agent({ id: "someone-new", name: "Someone New" });
		expect(mark(container)).toBe("initial:So");
	});
});
