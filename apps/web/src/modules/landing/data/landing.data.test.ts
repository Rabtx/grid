import { describe, expect, it } from "vitest";
import { INSTALL_STEPS, LIFECYCLE, NOT_LIST, PRINCIPLES, SITE, STATUS } from "./landing.data";

describe("landing copy", () => {
	it("points at the real repository", () => {
		expect(SITE.repoUrl).toBe("https://github.com/shabirkhan-dev/grid");
	});

	it("sends sign-in and the app to the console, not to pages of this site", () => {
		expect(SITE.appUrl).toBe("http://localhost:3001");
		expect(SITE.signInUrl).toBe("http://localhost:3001/login");
	});

	it("states what Grid is without leaving the tagline empty", () => {
		expect(SITE.tagline).toMatch(/operating system/i);
		expect(SITE.summary.length).toBeGreaterThan(40);
	});

	it("keeps the lifecycle in order and complete", () => {
		expect(LIFECYCLE[0]).toBe("Idea");
		expect(LIFECYCLE).toContain("Review");
		expect(LIFECYCLE).toContain("Deployment");
		expect(new Set(LIFECYCLE).size).toBe(LIFECYCLE.length);
	});

	it("gives every principle a body", () => {
		expect(PRINCIPLES).toHaveLength(4);
		for (const principle of PRINCIPLES) {
			expect(principle.title.length).toBeGreaterThan(0);
			expect(principle.body.length).toBeGreaterThan(40);
		}
	});

	it("ships install steps that are runnable commands", () => {
		expect(INSTALL_STEPS.length).toBeGreaterThan(0);
		for (const step of INSTALL_STEPS) {
			expect(step.command.trim()).not.toBe("");
			expect(step.label.trim()).not.toBe("");
		}
		const commands = INSTALL_STEPS.map((step) => step.command).join("\n");
		expect(commands).toContain("git clone");
		expect(commands).toContain("bun install");
		expect(commands).toContain("bun run dev");
	});

	it("does not claim unbuilt surfaces are working", () => {
		const overlap = STATUS.shipped.filter((item) =>
			(STATUS.next as readonly string[]).includes(item),
		);
		expect(overlap).toEqual([]);
		expect(STATUS.next.length).toBeGreaterThan(0);
	});

	it("keeps the 'not' list honest and non-empty", () => {
		expect(NOT_LIST.length).toBeGreaterThan(3);
	});
});
