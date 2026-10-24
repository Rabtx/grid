import { render } from "@solidjs/web";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HeaderTabs } from "./header";

describe("HeaderTabs", () => {
	let dispose = () => {};
	afterEach(() => {
		dispose();
		document.body.replaceChildren();
	});

	it("draws a pinned tab as its icon without a close button, and dots tabs that need you", async () => {
		const container = document.createElement("div");
		document.body.append(container);
		const onMenuAt = vi.fn();
		dispose = render(
			() => (
				<HeaderTabs
					tabs={[
						{ id: "a", label: "Alpha", href: "/a", icon: <svg />, pinned: true },
						{ id: "b", label: "Beta", href: "/b", icon: <svg />, attention: "waiting" },
						{ id: "c", label: "Gamma", href: "/c", icon: <svg /> },
					]}
					current="c"
					onClose={() => {}}
					onMenuAt={onMenuAt}
				/>
			),
			container,
		);
		const links = [...container.querySelectorAll("a")];
		expect(links[0]?.getAttribute("aria-label")).toBe("Alpha, pinned");
		expect(links[0]?.textContent).toBe("");
		expect(links[1]?.getAttribute("aria-label")).toBe("Beta, waiting on you");
		expect(container.querySelector('button[aria-label="Close Alpha"]')).toBeNull();
		expect(container.querySelector('button[aria-label="Close Beta"]')).not.toBeNull();

		container
			.querySelector('[data-tab="b"]')
			?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 4, clientY: 8 }));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(onMenuAt).toHaveBeenCalledWith("b", { x: 4, y: 8 });
	});
});
