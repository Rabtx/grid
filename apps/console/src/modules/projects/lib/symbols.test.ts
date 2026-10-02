import { describe, expect, it } from "vitest";

import { fileSymbols, symbolsAt } from "./symbols";

const ETA = `// Round an ETA
import { clamp } from "./math";

export const STEP_MINUTES = 5;

export function roundEta(minutes: number) {
	if (minutes <= 0) return 0;
	const step = STEP_MINUTES;
	return Math.round(minutes / step) * step;
}

export const formatEta = (minutes: number) => {
	return \`\${clamp(minutes, 1, 24)} h\`;
};

class Queue {
	retry(job: string) {
		return job;
	}
}

interface Job {
	id: string;
}
`;

describe("file symbols", () => {
	it("finds functions, arrow functions, classes, methods and types with their lines", async () => {
		const symbols = await fileSymbols("src/jobs/eta.ts", ETA);
		expect(symbols.map((symbol) => symbol.name)).toEqual([
			"roundEta",
			"formatEta",
			"Queue",
			"retry",
			"Job",
		]);
		expect(symbols[0]).toEqual({ name: "roundEta", from: 6, to: 10 });
	});

	it("names what a line sits in, outermost first, and nothing outside any", async () => {
		const symbols = await fileSymbols("eta.ts", ETA);
		expect(symbolsAt(symbols, 9).map((symbol) => symbol.name)).toEqual(["roundEta"]);
		expect(symbolsAt(symbols, 19).map((symbol) => symbol.name)).toEqual(["Queue", "retry"]);
		expect(symbolsAt(symbols, 4)).toEqual([]);
	});

	it("reads Python, and gives nothing for a file it has no parser for", async () => {
		const python = await fileSymbols("jobs.py", "class Job:\n    def run(self):\n        pass\n");
		expect(python.map((symbol) => symbol.name)).toEqual(["Job", "run"]);
		expect(await fileSymbols("README.md", "# Jobs\n")).toEqual([]);
	});
});
