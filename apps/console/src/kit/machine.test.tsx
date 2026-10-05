import { render } from "@solidjs/web";
import { expect, it } from "vitest";
import { MachineMetrics } from "./machine";

it("announces and draws a partial resource meter as the actual percentage", () => {
	const container = document.createElement("div");
	const dispose = render(
		() => <MachineMetrics stats={[{ label: "CPU", value: "25%", percent: 25, tone: "accent" }]} />,
		container,
	);
	try {
		expect(container.textContent).toContain("CPU percentage: 25%");
		expect(container.querySelector("[style]")?.getAttribute("style")).toContain("25%");
	} finally {
		dispose();
	}
});
