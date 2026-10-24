import { render } from "@solidjs/web";
import { describe, expect, it } from "vitest";

import { UsageRing } from "@/kit";

import { limitDetail } from "./usage-rings";

describe("usage rings", () => {
	it("say how much is used and when it resets", () => {
		const now = Date.parse("2026-10-24T10:00:00.000Z");
		expect(
			limitDetail(
				{ window: "5h", usedPercent: 82.4, resetsAt: "2026-10-24T12:10:00.000Z", limited: false },
				now,
			),
		).toBe("82% used · resets in 2h 10m");
		expect(
			limitDetail({ window: "Weekly", usedPercent: 100, resetsAt: null, limited: true }, now),
		).toBe("Used up");
		expect(
			limitDetail({ window: "5h", usedPercent: null, resetsAt: null, limited: false }, now),
		).toBe("Allowed");
	});

	it("draw a window as a ring with its share inside", () => {
		const container = document.createElement("div");
		const dispose = render(() => <UsageRing window="5h" used={64} detail="64% used" />, container);
		expect(container.querySelector('[role="img"]')?.getAttribute("aria-label")).toBe(
			"5h: 64% used",
		);
		expect(container.textContent).toContain("64");
		dispose();
	});
});
