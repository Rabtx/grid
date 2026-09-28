import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Screens only compose the kit. Every .tsx file outside `src/kit` (tests aside) is held to this:
 * no inline styles, no one-off values, no raw colours, and no radii or shadows of its own —
 * those live in the kit's tokens and components, so a design tweak is made once. The old `@/ui`
 * primitives are gone; the last rule keeps them from coming back.
 */
const RULES: { pattern: RegExp; why: string }[] = [
	{ pattern: /\sstyle=/, why: "inline style (put it in a kit component or token)" },
	{
		pattern: /(?:^|[\s"'`:])[a-z][a-z0-9-]*-\[[^\]]+\]/,
		why: "one-off value in brackets (use the scale or a kit utility)",
	},
	{ pattern: /#[0-9a-fA-F]{3,8}\b/, why: "raw hex colour (use a token)" },
	{
		pattern: /(?:^|[\s"'`:])!?rounded(?:-[a-z0-9-]+)?(?=[\s"'`])/,
		why: "own radius (kit components and surfaces set corners)",
	},
	{
		pattern: /(?:^|[\s"'`:])!?shadow-[a-z0-9-]+/,
		why: "own shadow (kit components and surfaces set elevation)",
	},
	{
		pattern:
			/(?:^|[\s"'`:])(?:bg|text|border|ring|fill|stroke)-(?:white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\d+)?\b/,
		why: "raw palette colour (use fg, surface, line, fill or a signal)",
	},
	{
		pattern: /font-(?:thin|light|semibold|bold|extrabold|black)\b/,
		why: "weight outside regular and medium",
	},
	{
		pattern: /from\s+["']@\/ui(?:\/[^"']*)?["']/,
		why: "import from the removed @/ui (the kit has it, icons included)",
	},
];

function tsxFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) return entry === "kit" ? [] : tsxFiles(path);
		return entry.endsWith(".tsx") ? [path] : [];
	});
}

describe("kit guard", () => {
	it("keeps screens built on the kit free of their own styling", () => {
		const src = join(__dirname, "..");
		// Tests build fixtures, not screens.
		const screens = tsxFiles(src).filter((file) => !file.endsWith(".test.tsx"));
		expect(screens.length).toBeGreaterThan(0);

		const violations: string[] = [];
		for (const file of screens) {
			readFileSync(file, "utf8")
				.split("\n")
				.forEach((line, index) => {
					if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
					for (const rule of RULES) {
						const match = line.match(rule.pattern);
						if (match)
							violations.push(
								`${relative(process.cwd(), file)}:${index + 1}: ${rule.why} — ${match[0].trim()}`,
							);
					}
				});
		}
		if (violations.length > 0)
			expect.fail(`${violations.length} kit guard violation(s):\n\n${violations.join("\n")}`);
	});

	it("keeps every corner on the roundness slider", () => {
		// The kit and the stylesheets set corners only from the kit's radius scale, which follows
		// Settings → Appearance → Corner roundness. Circles and pills (full, 999px) are shapes, and 0 is
		// no corner, so both are allowed.
		const src = join(__dirname, "..");
		const kit = readdirSync(join(src, "kit"))
			.filter((entry) => entry.endsWith(".tsx") && !entry.endsWith(".test.tsx"))
			.map((entry) => join(src, "kit", entry));
		const css = [join(src, "styles", "global.css")];
		const violations: string[] = [];
		for (const file of [...kit, ...css]) {
			readFileSync(file, "utf8")
				.split("\n")
				.forEach((line, index) => {
					const fixed =
						line.match(
							/(?:^|[\s"'`:])rounded(?:-[a-z]+)?-\[(?!calc\([^\]]*kit-radius-scale)[^\]]+\]/,
						) ??
						line.match(
							/(?:^|[\s"'`:])rounded(?:-(?:t|b|l|r|tl|tr|bl|br|s|e))?(?:-(?:xs|sm|md|lg|xl|2xl|3xl))?(?=[\s"'`])/,
						) ??
						line.match(
							/border-radius:(?!\s*(?:0\b|var\(|999|9999|calc\([^;]*kit-radius-scale))[^;]+;/,
						);
					if (fixed)
						violations.push(`${relative(process.cwd(), file)}:${index + 1}: ${fixed[0].trim()}`);
				});
		}
		if (violations.length > 0)
			expect.fail(`Corners off the roundness slider:\n\n${violations.join("\n")}`);
	});
});
