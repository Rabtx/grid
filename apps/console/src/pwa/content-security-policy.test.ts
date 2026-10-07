import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] ?? "";
const directive = (name: string) =>
	policy
		.split(";")
		.map((part) => part.trim().split(/\s+/))
		.find(([key]) => key === name)
		?.slice(1) ?? [];

describe("the console's Content-Security-Policy", () => {
	it("runs scripts from this origin only, never inline", () => {
		expect(directive("script-src")).toEqual(["'self'"]);
		expect(directive("object-src")).toEqual(["'none'"]);
		expect(directive("base-uri")).toEqual(["'self'"]);
	});

	it("talks to the API and runner through this origin only", () => {
		expect(directive("connect-src")).toEqual(["'self'"]);
	});

	it("leaves no inline script in the page for the policy to block", () => {
		const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
		expect(scripts.length).toBeGreaterThan(0);
		for (const [, attributes, body] of scripts) {
			expect(attributes).toContain("src=");
			expect(body?.trim()).toBe("");
		}
	});

	it("comes before every script, so it applies to all of them", () => {
		expect(html.indexOf("Content-Security-Policy")).toBeLessThan(html.indexOf("<script"));
	});
});
