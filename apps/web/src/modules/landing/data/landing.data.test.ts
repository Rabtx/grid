import { describe, expect, it } from "vitest";
import {
	AGENTS,
	COMMANDS,
	FEATURES,
	INSTALL_URL,
	INSTALLS,
	PRINCIPLES,
	SITE,
	STUDIO,
} from "./landing.data";

describe("landing copy", () => {
	it("points at the real repository", () => {
		expect(SITE.repoUrl).toBe("https://github.com/rabtx/grid");
		expect(SITE.docsUrl.startsWith(SITE.repoUrl)).toBe(true);
	});

	it("credits the studio and links to its page about Grid", () => {
		expect(STUDIO.url).toBe("https://rabtx.dev");
		expect(STUDIO.gridPage.startsWith(STUDIO.url)).toBe(true);
	});

	it("offers no sign-in link unless a console is hosted", () => {
		expect(SITE.signInUrl).toBeNull();
	});

	it("states what Grid is without leaving the tagline empty", () => {
		expect(SITE.tagline.length).toBeGreaterThan(10);
		expect(SITE.summary.length).toBeGreaterThan(40);
	});

	it("serves the installer from this site", () => {
		expect(INSTALL_URL).toMatch(/^https?:\/\/[^/]+\/install\.sh$/);
	});

	it("installs Grid by default and only a runner when asked", () => {
		const [grid, runner] = INSTALLS;
		expect(grid.command).toBe(`curl -fsSL ${INSTALL_URL} | bash`);
		expect(runner.command).toBe(`curl -fsSL ${INSTALL_URL} | bash -s -- runner`);
		for (const install of INSTALLS) {
			expect(install.steps.length).toBeGreaterThan(2);
			expect(install.needs).toMatch(/git/);
		}
	});

	it("documents only grid commands the script has", () => {
		for (const [command] of COMMANDS)
			expect(command).toMatch(/^grid (status|logs|pair|update|uninstall)$/);
	});

	it("gives every feature and principle a body", () => {
		for (const item of [...FEATURES, ...PRINCIPLES]) {
			expect(item.title.length).toBeGreaterThan(0);
			expect(item.body.length).toBeGreaterThan(20);
		}
		expect(new Set(FEATURES.map((feature) => feature.id)).size).toBe(FEATURES.length);
	});

	it("names the agents the runner drives", () => {
		expect(AGENTS).toContain("Claude Code");
		expect(AGENTS).toContain("Codex");
	});
});
