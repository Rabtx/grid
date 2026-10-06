import { describe, expect, it } from "vitest";

import { renderMarkdown, sanitizeHtml } from "./markdown";

const html = (text: string) => renderMarkdown(text, { allowHtml: true });

describe("pull request descriptions with HTML", () => {
	it("sanitises what an unwrapped tag held, not just the tag", () => {
		// Unknown tags are unwrapped; their children used to skip sanitising and keep handlers.
		for (const wrapper of ["u", "font", "center", "custom-tag"]) {
			const out = html(`<${wrapper}><img src="x" onerror="alert(1)"></${wrapper}>`);
			expect(out).not.toMatch(/onerror/i);
			expect(out).toContain("<img");
		}
	});

	it("sanitises through nested unknown tags", () => {
		const out = sanitizeHtml(
			'<u><font><a href="javascript:alert(1)" onclick="x()">go</a><svg onload="x()"></svg></font></u>',
		);
		expect(out).not.toMatch(/javascript:|onclick|onload|<svg/i);
		expect(out).toContain(">go</a>");
	});

	it("drops noscript and its content", () => {
		const out = sanitizeHtml(
			'<noscript><p title="</noscript><img src=x onerror=alert(1)>"></p></noscript>',
		);
		expect(out).not.toMatch(/onerror|noscript/i);
	});

	it("keeps only the classes the renderer writes, never the console's own utilities", () => {
		const out = sanitizeHtml(
			'<div class="fixed inset-0 z-50 code-block">x</div><span class="bg-black">y</span>',
		);
		expect(out).toContain('class="code-block"');
		expect(out).not.toMatch(/fixed|inset-0|z-50|bg-black/);
	});

	it("still highlights code and marks file paths", () => {
		const out = html("Edit `src/app.ts`\n\n```ts\nconst a = 1;\n```");
		expect(out).toContain('class="file-chip"');
		expect(out).toMatch(/class="hljs-/);
		expect(out).toContain('class="code-block"');
	});
});
