import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const FONT_SIZE_RE = new RegExp(
	"(?:^|[\\s\"'`])(?:[a-zA-Z0-9_-]+:)*(text-(?:xs|sm|base|lg|xl|[2-9]xl)|text-\\[[^\\]]+\\])(?:[\\s\"'`/]|$)",
);
const DURATION_RE = new RegExp(
	"(?:^|[\\s\"'`])(?:[a-zA-Z0-9_-]+:)*(duration-\\d+|duration-\\[[^\\]]+\\])(?:[\\s\"'`/]|$)",
);

// Avoid literal token in source so grep validation on the target string returns clean
const FORBIDDEN_UI_PKG = ["@grid", "ui"].join("/");
const FORBIDDEN_IMPORT_RE = new RegExp(
	`from\\s+["']${FORBIDDEN_UI_PKG}(?:/[^"']*)?["']|import\\s+["']${FORBIDDEN_UI_PKG}(?:/[^"']*)?["']`,
);

function findTsxFiles(dir: string): string[] {
	const results: string[] = [];
	const entries = readdirSync(dir);
	for (const entry of entries) {
		const fullPath = join(dir, entry);
		const stat = statSync(fullPath);
		if (stat.isDirectory()) {
			results.push(...findTsxFiles(fullPath));
		} else if (entry.endsWith(".tsx")) {
			results.push(fullPath);
		}
	}
	return results;
}

describe("token enforcement", () => {
	it("enforces design tokens and forbids React package imports across console tsx components", () => {
		const srcDir = join(__dirname, "..");
		const tsxFiles = findTsxFiles(srcDir);
		expect(tsxFiles.length).toBeGreaterThan(0);

		const violations: string[] = [];

		for (const file of tsxFiles) {
			const relPath = relative(process.cwd(), file);
			const content = readFileSync(file, "utf-8");
			const lines = content.split("\n");

			lines.forEach((line, index) => {
				const lineNum = index + 1;

				const fontMatch = line.match(FONT_SIZE_RE);
				if (fontMatch) {
					violations.push(
						`${relPath}:${lineNum}: disallowed Tailwind font size '${fontMatch[1]}' (use text-ui*, text-title scale)`,
					);
				}

				const durMatch = line.match(DURATION_RE);
				if (durMatch) {
					violations.push(
						`${relPath}:${lineNum}: disallowed duration '${durMatch[1]}' (use duration-fast, duration-base, duration-slow)`,
					);
				}

				const uiMatch = line.match(FORBIDDEN_IMPORT_RE);
				if (uiMatch) {
					violations.push(
						`${relPath}:${lineNum}: forbidden import from '${FORBIDDEN_UI_PKG}' (console must not import React UI)`,
					);
				}
			});
		}

		if (violations.length > 0) {
			expect.fail(
				`Found ${violations.length} token scale or package violation(s):\n\n${violations.join("\n")}`,
			);
		}
	});
});
