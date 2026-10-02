import { render } from "@solidjs/web";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ContextMeter, VoiceBar } from "./prompt-box";

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

describe("ContextMeter", () => {
	it("says how many tokens of how many", () => {
		const host = document.createElement("div");
		document.body.append(host);
		const dispose = render(() => <ContextMeter used={76_000} total={200_000} />, host);
		expect(host.textContent).toContain("Context 38% · 76k of 200k tokens");
		dispose();
		host.remove();
	});
});
