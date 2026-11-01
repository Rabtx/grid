import { render } from "@solidjs/web";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PromptBox, VoiceBar } from "./prompt-box";

describe("VoiceBar", () => {
	let dispose: (() => void) | undefined;
	afterEach(() => {
		dispose?.();
		document.body.replaceChildren();
	});

	function mount(props: Partial<Parameters<typeof VoiceBar>[0]>): HTMLElement {
		const host = document.createElement("div");
		document.body.append(host);
		const startedAt = Date.now() - 7_200;
		dispose = render(
			() => (
				<VoiceBar
					startedAt={startedAt}
					levels={[]}
					transcribing={false}
					onCancel={() => {}}
					onDone={() => {}}
					{...props}
				/>
			),
			host,
		);
		return host;
	}

	it("shows the time since listening began and the microphone's level", () => {
		const host = mount({ levels: [0.1, 0.5, 0.9] });
		expect(host.textContent).toContain("0:07");
		expect(host.querySelectorAll("output span[aria-hidden] > span")).toHaveLength(3);
	});

	it("shows the words heard so far where there is no level", () => {
		const host = mount({ heard: "Round the ETAs" });
		expect(host.textContent).toContain("Round the ETAs");
	});

	it("cancels, finishes, and waits while transcribing", () => {
		const onCancel = vi.fn();
		const onDone = vi.fn();
		const host = mount({ onCancel, onDone, transcribing: true });
		host.querySelector<HTMLButtonElement>('[aria-label="Cancel voice input"]')?.click();
		expect(onCancel).toHaveBeenCalled();
		const done = host.querySelector<HTMLButtonElement>('[aria-label="Done, insert the words"]');
		expect(done?.disabled).toBe(true);
		expect(host.textContent).toContain("Transcribing");
	});
});

describe("PromptBox", () => {
	it("lights up while its agent works, and goes back when it stops", async () => {
		const host = document.createElement("div");
		document.body.append(host);
		const [working, setWorking] = createSignal(true);
		const dispose = render(
			() => (
				<PromptBox
					field={<textarea />}
					send={<button type="submit">Send</button>}
					working={working()}
				/>
			),
			host,
		);
		const card = () => host.querySelector("form");
		const light = () => card()?.querySelector(".kit-composer-loader");
		expect(card()?.hasAttribute("data-working")).toBe(true);
		expect(light()?.hasAttribute("data-active")).toBe(true);
		// The band: a bloom, a tight glow and a crisp line, each a dash on the card's outline.
		expect(light()?.querySelectorAll("rect.kit-composer-loader-band")).toHaveLength(3);
		setWorking(false);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(card()?.hasAttribute("data-working")).toBe(false);
		expect(light()?.hasAttribute("data-active")).toBe(false);
		dispose();
		host.remove();
	});
});
